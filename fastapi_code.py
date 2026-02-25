from fastapi import FastAPI
from fastapi.responses import JSONResponse
from functions import genrate_otp, check_otp
from pydantic import BaseModel
import uvicorn

app = FastAPI()

class OTPVerifyRequest(BaseModel):
    secret: str
    user_input: str

@app.get("/")
def hello_world():
    return {"message": "This is ur FastAPI app"}

@app.get("/data")
def send_info():
    return {"message": "Jai mata di"}

@app.get("/otp")
def get_otp():
    totp = genrate_otp()
    return {"otp": totp.now(), "secret": totp.secret}

@app.post("/otp")
def verify_otp(body: OTPVerifyRequest):
    import pyotp
    totp = pyotp.TOTP(body.secret, interval=300)
    valid = totp.verify(body.user_input, valid_window=1)
    return {"valid": valid}

if __name__ == "__main__":
    uvicorn.run("fastapi_code:app", reload=True)
