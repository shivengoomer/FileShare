import streamlit as st
import requests
import time

BASE_URL = "http://localhost:8000"

st.set_page_config(page_title="FileShare App", page_icon="🔐", layout="centered")

# ---------- Header ----------
st.title("🔐 FileShare App")
st.caption("Powered by FastAPI + Streamlit")
st.divider()

# ---------- Session state ----------
if "otp_secret" not in st.session_state:
    st.session_state.otp_secret = None
if "otp_value" not in st.session_state:
    st.session_state.otp_value = None
if "otp_generated_at" not in st.session_state:
    st.session_state.otp_generated_at = None

# ---------- Section 1: Data ----------
st.subheader("📡 Server Message")
if st.button("Fetch Message", use_container_width=True):
    try:
        response = requests.get(f"{BASE_URL}/data", timeout=5)
        if response.status_code == 200:
            msg = response.json().get("message", "No message")
            st.success(f"💬 {msg}")
        else:
            st.error(f"Error {response.status_code}")
    except requests.exceptions.RequestException as e:
        st.error(f"Could not reach server: {e}")

st.divider()

# ---------- Section 2: OTP ----------
st.subheader("🔑 One-Time Password (5 min validity)")

col1, col2 = st.columns(2)

with col1:
    if st.button("Generate OTP", use_container_width=True, type="primary"):
        try:
            resp = requests.get(f"{BASE_URL}/otp", timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                st.session_state.otp_value = data["otp"]
                st.session_state.otp_secret = data["secret"]
                st.session_state.otp_generated_at = time.time()
            else:
                st.error("Failed to generate OTP")
        except requests.exceptions.RequestException as e:
            st.error(f"Could not reach server: {e}")

if st.session_state.otp_value:
    elapsed = int(time.time() - st.session_state.otp_generated_at)
    remaining = max(0, 300 - elapsed)
    mins, secs = divmod(remaining, 60)

    st.info(f"🔢 Your OTP: **{st.session_state.otp_value}**")
    if remaining > 0:
        st.caption(f"⏳ Expires in {mins}m {secs}s")
    else:
        st.warning("⚠️ OTP may have expired. Generate a new one.")

st.divider()

# ---------- Section 3: Verify OTP ----------
st.subheader("✅ Verify OTP")

user_otp = st.text_input("Enter OTP to verify", max_chars=6, placeholder="e.g. 435970")

with col2:
    verify_clicked = st.button("Verify OTP", use_container_width=True)

if verify_clicked:
    if not st.session_state.otp_secret:
        st.warning("Generate an OTP first.")
    elif not user_otp.strip():
        st.warning("Please enter the OTP.")
    else:
        try:
            resp = requests.post(
                f"{BASE_URL}/otp",
                json={"secret": st.session_state.otp_secret, "user_input": user_otp.strip()},
                timeout=5,
            )
            if resp.status_code == 200:
                valid = resp.json().get("valid", False)
                if valid:
                    st.success("✅ OTP is valid!")
                    st.balloons()
                else:
                    st.error("❌ Invalid OTP. Try again.")
            else:
                st.error(f"Server error: {resp.status_code}")
        except requests.exceptions.RequestException as e:
            st.error(f"Could not reach server: {e}")

