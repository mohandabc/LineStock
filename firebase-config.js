// firebase-config.js
// Replace these values with your Firebase project configuration
// Get these from: Firebase Console > Project Settings > Your apps > SDK setup and configuration

export const firebaseConfig = {
  apiKey: "AIzaSyBge-kEGCNipoMSCtQXzIkHiW8Ua3NGNTE",
  authDomain: "linestock-35107.firebaseapp.com",
  //   databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "linestock-35107",
  storageBucket: "linestock-35107.firebasestorage.app",
  messagingSenderId: "937624489891",
  appId: "1:937624489891:web:3052488d3a19b2d5951416",
};
const app = initializeApp(firebaseConfig);

// SETUP INSTRUCTIONS:
// 1. Go to https://console.firebase.google.com/
// 2. Create a new project (or select existing)
// 3. Click on "Realtime Database" in the left menu
// 4. Click "Create Database"
// 5. Choose a location close to you
// 6. Start in TEST MODE for now (you can secure it later)
// 7. Go to Project Settings (gear icon) > General
// 8. Scroll down to "Your apps" and click the web icon (</>)
// 9. Register your app (give it a name)
// 10. Copy the firebaseConfig object values above
// 11. Replace ALL the placeholder values above with your actual config values
//
// SECURITY RULES (for production):
// Go to Realtime Database > Rules tab and use:
// {
//   "rules": {
//     "lines": {
//       ".read": true,
//       ".write": true
//     }
//   }
// }
//
// Note: These open rules are fine for this use case since it's internal.
// For more security, you can add Firebase Authentication later.
