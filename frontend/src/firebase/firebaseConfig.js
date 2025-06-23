import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

export const firebaseConfig = {
  apiKey: "AIzaSyBFhRWq8VKHcWEsCjs-N8dU9bv9eAS9gAk",
  authDomain: "user-analyzer-96b74.firebaseapp.com",
  projectId: "user-analyzer-96b74",
  storageBucket: "user-analyzer-96b74.firebasestorage.app",
  messagingSenderId: "575389970603",
  appId: "1:575389970603:web:d678eadf310a5b130a07ee",
  measurementId: "G-LKM0JKL5R4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);


export const auth = getAuth(app);