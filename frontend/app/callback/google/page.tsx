"use client";
import { useEffect } from "react";

export default function GoogleCallback() {
  useEffect(() => {
    // Parse the query params (e.g. ?code=...)
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    
    if (code) {
      window.opener?.postMessage(
        { type: "google-oauth-code", code: code },
        window.location.origin
      );
    } else {
      window.opener?.postMessage(
        { type: "google-oauth-error", error: "No authorization code found in response." },
        window.location.origin
      );
    }
    
    // Close the popup
    window.close();
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background text-foreground p-4">
      <div className="text-center">
        <h2 className="text-xl font-semibold mb-2">Authentication Successful</h2>
        <p className="text-muted-foreground text-sm">You can close this window if it doesn't close automatically.</p>
      </div>
    </div>
  );
}
