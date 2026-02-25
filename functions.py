import pyotp
import time

# 1. Generate a random base32 secret key
# This key must be shared between the server and the client (e.g., the user's phone app)
def genrate_otp():
    secret = pyotp.random_base32()
    totp = pyotp.TOTP(secret, interval=300)
    current_otp = totp.now()
    print(f"Secret: {secret}")
    print(f"Current OTP: {current_otp}")
    return totp # => '492039' (example output)


def check_otp(totp,user_input):

    if totp.verify(user_input):
        print("OTP is valid!")
    else:
        print("Invalid OTP.")

