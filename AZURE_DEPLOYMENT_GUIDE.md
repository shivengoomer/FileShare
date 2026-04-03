# Azure App Service Deployment Guide

## Problem Diagnosis

The 404 error with HTML response indicates that Azure App Service is not properly routing requests to your FastAPI application. This happens when:

- The startup command isn't configured correctly
- The web.config (for Windows) isn't present or configured properly
- The app isn't installed/running properly

## Solution

### For All Deployments

1. **Push your complete project root to Azure** (including the new files we've added):

   ```bash
   git add .
   git commit -m "Fix: Add Azure deployment configuration and fix socket import"
   git push azure main  # or your remote name
   ```

   Files being deployed:
   - ✅ `web.config` - For Windows App Service
   - ✅ `startup.sh` - For Linux App Service
   - ✅ Fixed `backend/main.py` - Socket import moved to top
   - ✅ All other project files

### Step 1: In Azure Portal - Application Settings

1. Go to **App Service → Configuration → Application settings**
2. Add/Update these variables:
   ```
   PORT: 8000
   SCM_DO_BUILD_DURING_DEPLOYMENT: true
   WEBSITES_ENABLE_APP_SERVICE_STORAGE: true
   ```

### Step 2: Choose Your Platform

#### Option A: Windows App Service (Recommended if already on Windows)

1. Go to **Configuration → General settings**
2. Ensure:
   - Stack: `Python`
   - Version: `3.11` or higher
3. Go to **Configuration → Application settings**
4. Set Startup command to:

   ```
   python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
   ```

   OR use the startup.sh:

   ```
   bash startup.sh
   ```

5. The `web.config` file will automatically be used by IIS to route requests to Python

#### Option B: Linux App Service (Recommended for new deployments)

1. Go to **Configuration → General settings**
2. Ensure:
   - Runtime stack: `Python`
   - Version: `3.11` or higher
   - Startup command:
   ```
   bash startup.sh
   ```

### Step 3: Verify Deployment

1. After deployment completes, check the logs:

   ```bash
   az webapp log tail --resource-group <RG_NAME> --name <APP_NAME>
   ```

2. Test the health endpoint:

   ```bash
   curl https://fileshare.shivengoomer.dev/health
   ```

   Should return: `{"status":"ok"}`

3. Test the upload init endpoint:
   ```bash
   curl -X POST "https://fileshare.shivengoomer.dev/rooms/test-room-id/upload/init?filename=test.txt&content_type=text/plain&total_chunks=1"
   ```
   Should return JSON (even if room_id is invalid, it should return `{"detail":"Room not found"}`)

### Step 4: Check Environment Variables

Ensure these are set correctly:

- `DATABASE_URL` - Connection string to your PostgreSQL database
- `SECRET_KEY` - Change from the default value
- `CORS_ORIGINS` - Should include your frontend domain
- `UPLOAD_DIR` - Set to `/home/site/wwwroot/uploads` for App Service

Example:

```
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/fileshare
CORS_ORIGINS=["https://fileshare.shivengoomer.dev"]
SECRET_KEY=your-secret-key-here
UPLOAD_DIR=/home/site/wwwroot/uploads
```

## Troubleshooting

### If you're Still Getting 404 Errors:

1. **Check if the app is running:**

   ```bash
   az webapp show --resource-group <RG_NAME> --name <APP_NAME> --query "state"
   ```

   Should return `"Running"`

2. **Check logs for startup errors:**

   ```bash
   az webapp log tail --resource-group <RG_NAME> --name <APP_NAME> --max-lines 100
   ```

3. **Restart the app:**

   ```bash
   az webapp restart --resource-group <RG_NAME> --name <APP_NAME>
   ```

4. **Check if /health endpoint works:**
   - If it returns `{"status":"ok"}`, the app is running
   - If it returns HTML, the app isn't serving requests properly

### If Database Connection Fails:

1. Ensure PostgreSQL is accessible from App Service
2. Check firewall rules in your database server
3. Verify CONNECTION_STRING is properly formatted with the password

### If Static Files Aren't Serving:

The frontend should be built and located at `/frontend/dist`. If not:

```bash
cd frontend
npm install
npm run build
```

## Files Modified in This Fix

- **backend/main.py** - Fixed socket import order
- **web.config** - Added proper IIS configuration for Windows
- **startup.sh** - Enhanced with error checking and logging

## Additional Resources

- [Deploy Python apps to App Service](https://docs.microsoft.com/en-us/azure/app-service/quickstart-python)
- [FastAPI Deployment](https://fastapi.tiangolo.com/deployment/)
- [Azure App Service Configuration](https://docs.microsoft.com/en-us/azure/app-service/configure-common)
