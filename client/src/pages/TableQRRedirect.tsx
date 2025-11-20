import { useEffect } from "react";

/**
 * Component to handle table QR code redirects
 * Redirects to home page (https://quickbite.nexitel.org/ or base URL)
 */
export default function TableQRRedirect() {
  useEffect(() => {
    // Redirect to home page
    const baseUrl = window.location.origin;
    window.location.href = baseUrl;
  }, []);

  // Show loading while redirecting
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <p className="text-lg text-gray-600">Redirecting to home page...</p>
      </div>
    </div>
  );
}

