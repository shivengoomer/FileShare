from fastapi import FastAPI,jsonify
import uvicorn
from functions import genrate_otp,check_otp
app = FastAPI()

@app.route("/")
def hello_world():
    return "<p> This is ur flask app </p>"
@app.route("/data" ,methods=['GET'])
def send_info():
    return jsonify({"message":"Jai mata di"})
@app.route("/otp" ,methods=['GET',"POST"])


if __name__ == "__main__":
    uvicorn.run("fastapi_code:app")
