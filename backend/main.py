import asyncio
import json
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Literal
from google import genai
from google.genai import types
import jwt
import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field
from pymongo import AsyncMongoClient
from pymongo.errors import DuplicateKeyError, PyMongoError
from pwdlib import PasswordHash

# Resolve .env from the project root so startup works regardless of the shell's cwd.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")

MONGO_URI = os.getenv("MONGODB_URI", "").strip()
JWT_SECRET = os.getenv("JWT_SECRET", "")
DATABASE = os.getenv("MONGODB_DATABASE", "healthcopilot")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
DEFAULT_GEMINI_MODEL = "gemini-3.5-flash"
GEMINI_MODEL = (os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL) or DEFAULT_GEMINI_MODEL).strip().removeprefix("models/") or DEFAULT_GEMINI_MODEL

VALID_MONGO_SCHEMES = ("mongodb://", "mongodb+srv://")

password_hash = PasswordHash.recommended()
client: AsyncMongoClient | None = None
database_ready = False
database_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(_: FastAPI):
    global client, database_ready
    mongo_client: AsyncMongoClient | None = None
    try:
        database_ready = False
        if MONGO_URI:
            normalized_uri = MONGO_URI.strip()
            if not normalized_uri.startswith(VALID_MONGO_SCHEMES):
                app.state.mongo_uri_error = f"MONGODB_URI must start with 'mongodb://' or 'mongodb+srv://'. Received: {normalized_uri[:40]}"
            else:
                mongo_client = AsyncMongoClient(normalized_uri, serverSelectionTimeoutMS=5000)
                client = mongo_client
        else:
            app.state.mongo_uri_error = "MongoDB is not configured; account sync is disabled. Chat still works without it."
        yield
    finally:
        client = None
        if mongo_client is not None:
            await mongo_client.close()


app = FastAPI(title="HealthCopilot API", version="1.0.0", lifespan=lifespan)
origins = [item.strip() for item in os.getenv("FRONTEND_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
requests: dict[str, deque[float]] = defaultdict(deque)


async def get_database():
    global database_ready
    mongo_client = client
    if mongo_client is None:
        raise HTTPException(
            status_code=503,
            detail="MongoDB account storage is not configured. Set MONGODB_URI to enable accounts; chat does not require MongoDB.",
        )
    if not database_ready:
        async with database_lock:
            if not database_ready:
                try:
                    await mongo_client.admin.command("ping")
                    await mongo_client[DATABASE].users.create_index("email", unique=True)
                    await mongo_client[DATABASE].health_data.create_index("user_id", unique=True)
                except PyMongoError:
                    raise HTTPException(
                        status_code=503,
                        detail="MongoDB is unavailable. Check MONGODB_URI, network access, and database permissions.",
                    ) from None
                database_ready = True
    return mongo_client[DATABASE]


def require_jwt_secret() -> None:
    if len(JWT_SECRET) < 32:
        raise HTTPException(
            status_code=503,
            detail="Account sign-in is not configured. Set JWT_SECRET to a random value of at least 32 characters.",
        )


@app.middleware("http")
async def secure_responses(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.path.startswith(("/api/", "/auth/")):
        response.headers["Cache-Control"] = "no-store"
    if os.getenv("COOKIE_SECURE", "false").lower() == "true":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.middleware("http")
async def rate_limit(request: Request, call_next):
    now = time.monotonic()
    host = request.client.host if request.client else "unknown"
    key = f"{host}:{request.url.path}" if request.url.path in {"/auth/login", "/auth/register"} else host
    bucket = requests[key]
    while bucket and bucket[0] < now - 60:
        bucket.popleft()
    limit = 10 if request.url.path in {"/auth/login", "/auth/register"} else 120
    if len(bucket) >= limit:
        return JSONResponse(
            status_code=429, content={"detail": "Too many requests. Please try again shortly."}
        )
    bucket.append(now)
    if len(requests) > 10000:
        for stale_host in [host for host, history in requests.items() if not history or history[-1] < now - 60]:
            requests.pop(stale_host, None)
    try:
        if int(request.headers.get("content-length", "0")) > 2_000_000:
            return JSONResponse(status_code=413, content={"detail": "Request body exceeds the 2 MB limit."})
    except ValueError:
        return JSONResponse(status_code=400, content={"detail": "Invalid content length."})
    return await call_next(request)


class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class HealthPayload(BaseModel):
    data: dict[str, Any]


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class ChatPayload(BaseModel):
    messages: list[ChatMessage] = Field(min_length=1, max_length=20)


def issue_token(user_id: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(hours=8)
    return jwt.encode({"sub": user_id, "exp": expires}, JWT_SECRET, algorithm="HS256")


def set_session_cookie(response: JSONResponse, user_id: str) -> None:
    response.set_cookie(
        "hc_session", issue_token(user_id), httponly=True,
        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        samesite="strict", max_age=8 * 60 * 60, path="/",
    )


async def authenticated_user(request: Request) -> str:
    require_jwt_secret()
    token = request.cookies.get("hc_session")
    if not token:
        raise HTTPException(status_code=401, detail="Sign in to access your health data.")
    try:
        claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return claims["sub"]
    except (jwt.InvalidTokenError, KeyError):
        raise HTTPException(status_code=401, detail="Your session is invalid or expired.") from None


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "ai_configured": bool(GEMINI_API_KEY),
        "database_configured": bool(MONGO_URI and MONGO_URI.startswith(VALID_MONGO_SCHEMES)),
        "mongo_status": "configured" if MONGO_URI and MONGO_URI.startswith(VALID_MONGO_SCHEMES) else "disabled",
    }


def call_gemini(messages: list[dict[str, str]]) -> str:
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="AI chat is not configured. Add GEMINI_API_KEY to the project-root .env and restart the backend.",
        )

    safety_instructions = (
        "You are HealthCopilot, an educational health information assistant. "
        "Explain general health concepts in clear, calm language; ask relevant follow-up "
        "questions when important context is missing; and help users prepare concise, "
        "editable summaries or questions for a doctor visit. Never diagnose, claim certainty "
        "about a cause, prescribe or change medication, or imply that a clinician reviewed "
        "the information. Do not invent medical report values or claim access to records "
        "unless they are explicitly included in this conversation. Encourage a qualified "
        "clinician for personal medical assessment. If a user describes potentially serious "
        "or sudden warning symptoms, tell them to contact local emergency services or seek "
        "urgent care now, and do not delay that guidance with questions. You are not a "
        "replacement for a clinician."
    )

    prompt_parts = [safety_instructions]
    for message in messages:
        prompt_parts.append(f"{message['role'].capitalize()}: {message['content']}")
    prompt = "\n\n".join(prompt_parts)

    try:
        client = genai.Client(api_key=GEMINI_API_KEY)
        model_name = GEMINI_MODEL if GEMINI_MODEL.startswith("models/") else f"models/{GEMINI_MODEL}"
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.3),
        )
    except Exception as exc:  # pragma: no cover - surfaced as API error to the caller.
        message = str(exc)
        lower = message.lower()
        if "api key" in lower or "authentication" in lower or "forbidden" in lower or "unauthorized" in lower:
            raise HTTPException(
                status_code=502,
                detail="The Gemini API key is invalid or rejected. Check GEMINI_API_KEY in the project-root .env, then restart the backend.",
            ) from None
        if "not found" in lower or "404" in lower or "model" in lower:
            raise HTTPException(
                status_code=502,
                detail=f"The configured Gemini model '{GEMINI_MODEL}' is unavailable. Update GEMINI_MODEL in the project-root .env to a supported Gemini model and restart the backend.",
            ) from None
        raise HTTPException(
            status_code=502,
            detail="The Gemini API could not complete this request. Please try again shortly.",
        ) from None

    answer = getattr(response, "text", None)
    if not answer:
        candidates = getattr(response, "candidates", None) or []
        for candidate in candidates:
            candidate_parts = getattr(candidate, "content", None)
            if candidate_parts is None:
                continue
            parts = getattr(candidate_parts, "parts", None) or []
            for part in parts:
                text = getattr(part, "text", None)
                if text:
                    answer = text
                    break
            if answer:
                break
    if not isinstance(answer, str) or not answer.strip():
        raise HTTPException(
            status_code=502,
            detail="The Gemini provider returned an empty or unreadable response. Please try again.",
        )
    return answer.strip()


@app.post("/api/chat")
async def chat(payload: ChatPayload):
    if not GEMINI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="AI chat is not configured. Add GEMINI_API_KEY to the project-root .env and restart the backend.",
        )
    if payload.messages[-1].role != "user":
        raise HTTPException(status_code=422, detail="The last chat message must be from the user.")
    if sum(len(message.content) for message in payload.messages) > 16000:
        raise HTTPException(status_code=422, detail="Chat history is too long. Start a new conversation.")
    conversation = [{"role": message.role, "content": message.content} for message in payload.messages]
    reply = await asyncio.to_thread(call_gemini, conversation)
    return {"reply": reply}


@app.post("/auth/register")
async def register(credentials: Credentials):
    require_jwt_secret()
    database = await get_database()
    users = database.users
    try:
        result = await users.insert_one({
            "email": credentials.email.lower(),
            "password_hash": password_hash.hash(credentials.password),
            "created_at": datetime.now(timezone.utc),
        })
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="An account with this email already exists.") from None
    response = JSONResponse({"authenticated": True})
    set_session_cookie(response, str(result.inserted_id))
    return response


@app.post("/auth/login")
async def login(credentials: Credentials):
    require_jwt_secret()
    database = await get_database()
    user = await database.users.find_one({"email": credentials.email.lower()})
    if not user or not password_hash.verify(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    response = JSONResponse({"authenticated": True})
    set_session_cookie(response, str(user["_id"]))
    return response


@app.post("/auth/logout")
async def logout():
    response = JSONResponse({"signed_out": True})
    response.delete_cookie(
        "hc_session", path="/", httponly=True,
        secure=os.getenv("COOKIE_SECURE", "false").lower() == "true",
        samesite="strict",
    )
    return response


@app.get("/api/data")
async def read_data(user_id: str = Depends(authenticated_user)):
    database = await get_database()
    record = await database.health_data.find_one({"user_id": user_id}, {"_id": 0, "data": 1})
    return record["data"] if record else {}


@app.put("/api/data")
async def write_data(payload: HealthPayload, user_id: str = Depends(authenticated_user)):
    database = await get_database()
    await database.health_data.update_one(
        {"user_id": user_id},
        {"$set": {"data": payload.data, "updated_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    return {"saved": True}


@app.delete("/api/data")
async def delete_data(user_id: str = Depends(authenticated_user)):
    database = await get_database()
    await database.health_data.delete_one({"user_id": user_id})
    return {"deleted": True}


if __name__ == "__main__":
    uvicorn.run(
        app,
        host=os.getenv("API_HOST", "127.0.0.1"),
        port=int(os.getenv("API_PORT", "8000")),
    )
