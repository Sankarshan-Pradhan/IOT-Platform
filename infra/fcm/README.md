# Google Firebase Cloud Messaging (FCM) Credentials

To enable real-time background push alerts to operators' mobile devices (iOS / Android / Web) when away from the dashboard:

## Step 1: Download Service Account Key from Firebase Console
1. Go to your Firebase project: https://console.firebase.google.com/
2. Click **Project Settings** (gear icon) -> **Service accounts** tab.
3. Select **Firebase Admin SDK** -> click **Generate new private key**.
4. A JSON file will download (e.g. `your-project-firebase-adminsdk-xxxxx.json`).

## Step 2: Place Key in this Directory
Rename the downloaded file to:
```
infra/fcm/service-account.json
```

Or paste its JSON contents directly into `infra/.env`:
```env
FCM_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"..."}
```

The Go backend will automatically detect the key, authenticate via Google OAuth2 with RS256 signing, and dispatch push alerts directly to operators' phones via the **Firebase HTTP v1 API**.
