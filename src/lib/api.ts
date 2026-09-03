import { ApiError } from "./api-error";
import { emitApiError } from "./api-error-bus";
import { useAuthStore } from "./auth-store";
import { getApiRouteUrl } from "./runtime-config";

export async function api({
  url,
  init,
  params,
  raw,
  skipDefaultHeaders = false,
  onUploadProgress,
}: {
  url: string;
  init?: RequestInit;
  params?: Record<string, any> | string;
  raw?: boolean;
  skipDefaultHeaders?: boolean;
  onUploadProgress?: (progressEvent: ProgressEvent) => void;
}) {
  const fetchToken = useAuthStore.getState().fetchToken;
  const auth = await fetchToken();

  let queryString;
  if (typeof params === "string") {
    queryString = `?${params}`;
  } else {
    queryString = params
      ? `?${new URLSearchParams(
          Object.entries(params)
            .filter(([_, value]) => value !== undefined)
            .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {}),
        ).toString()}`
      : "";
  }

  // Always include auth header, but only include Content-Type if not skipping defaults
  const defaultHeaders = {
    ...(skipDefaultHeaders ? {} : { "Content-Type": "application/json" }),
  };

  const headers = {
    ...defaultHeaders,
    ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    ...init?.headers,
  };

  const finalUrl = `${getApiRouteUrl(url)}${queryString}`;

  // Use XMLHttpRequest for upload progress
  if (onUploadProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(init?.method || "GET", finalUrl);

      // Set headers
      Object.entries(headers).forEach(([key, value]) => {
        if (value) xhr.setRequestHeader(key, value);
      });

      // Handle progress
      xhr.upload.addEventListener("progress", onUploadProgress);

      // Handle completion
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const response = xhr.responseText
              ? JSON.parse(xhr.responseText)
              : null;
            resolve(convertDateFields(response));
          } catch {
            resolve(null);
          }
        } else {
          let parsed: any = null;
          try {
            parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
          } catch {
            // ignore
          }
          const candidateStrings = [
            parsed?.message,
            parsed?.error,
            parsed?.detail,
            parsed?.error?.message,
            parsed?.msg,
            parsed?.reason,
          ].filter(
            (v) => typeof v === "string" && v.trim().length > 0,
          ) as string[];
          const message =
            candidateStrings[0] ||
            (parsed?.error && typeof parsed.error === "object"
              ? JSON.stringify(parsed.error)
              : undefined) ||
            `HTTP error ${xhr.status}`;
          const err = new ApiError(message, {
            status: xhr.status,
            url: finalUrl,
            body: parsed ?? xhr.responseText,
            code: parsed?.code,
          });
          // Don't emit token-related errors or internal server errors
          const isTokenError =
            xhr.status === 401 ||
            message.toLowerCase().includes("invalid or missing token") ||
            message.toLowerCase().includes("token expired") ||
            message.toLowerCase().includes("authentication failed") ||
            message.toLowerCase().includes("unauthorized");
          const isInternalServerError =
            xhr.status === 500 ||
            message.toLowerCase().includes("internal server error");
          const isFolderExistsError =
            xhr.status === 400 ||
            message.toLowerCase().includes("Folder already exists");
          const isAccessDenied =
            xhr.status === 403 ||
            message
              .toLowerCase()
              .includes("You are not authorized to access this resource");
          if (
            !isTokenError &&
            !isFolderExistsError &&
            !isInternalServerError &&
            !isAccessDenied
          ) {
            emitApiError(err);
          }
          reject(err);
        }
      };

      // Handle error
      xhr.onerror = () => {
        const err = new ApiError("Network error occurred", {
          status: 0,
          url: finalUrl,
        });
        // Network errors are not token-related, so emit them
        emitApiError(err);
        reject(err);
      };

      // Send the request
      xhr.send(init?.body as FormData);
    });
  }

  // Use regular fetch for non-upload requests
  return await fetch(finalUrl, {
    ...init,
    headers,
    credentials: "include",
  }).then(async (res) => {
    if (!res.ok) {
      const contentType = res.headers.get("content-type") || "";
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch {
        bodyText = "";
      }
      let parsed: any;
      if (contentType.includes("application/json")) {
        try {
          parsed = bodyText ? JSON.parse(bodyText) : undefined;
        } catch {
          parsed = undefined;
        }
      }
      const candidateStrings = [
        parsed?.message,
        parsed?.error,
        parsed?.detail,
        parsed?.error?.message,
        parsed?.msg,
        parsed?.reason,
      ].filter((v) => typeof v === "string" && v.trim().length > 0) as string[];
      const message =
        candidateStrings[0] ||
        (parsed?.error && typeof parsed.error === "object"
          ? JSON.stringify(parsed.error)
          : undefined) ||
        (bodyText ? bodyText.slice(0, 500) : `HTTP error ${res.status}`);
      const code = parsed?.code || parsed?.error?.code;
      const err = new ApiError(message, {
        status: res.status,
        url: finalUrl,
        body: parsed ?? bodyText,
        code,
      });
      // Don't emit token-related errors or internal server errors
      const isTokenError =
        res.status === 401 ||
        message.toLowerCase().includes("invalid or missing token") ||
        message.toLowerCase().includes("token expired") ||
        message.toLowerCase().includes("authentication failed") ||
        message.toLowerCase().includes("unauthorized");
      const isInternalServerError =
        res.status === 500 ||
        message.toLowerCase().includes("internal server error");
      const isFolderExistsError =
        res.status === 400 ||
        message.toLowerCase().includes("Folder already exists");
      const isAccessDenied =
        res.status === 403 ||
        message
          .toLowerCase()
          .includes("You are not authorized to access this resource");
      if (
        !isTokenError &&
        !isFolderExistsError &&
        !isInternalServerError &&
        !isAccessDenied
      ) {
        emitApiError(err);
      }
      throw err;
    }
    if (raw) {
      return res;
    }
    return res.json().then((data) => convertDateFields(data));
  });
}

export function convertDateFields(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(convertDateFields);
  } else if (obj !== null && typeof obj === "object") {
    const newObj: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string") {
        const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
        const customRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/;

        if (isoRegex.test(value)) {
          // Handle ISO 8601 format
          const dateString = value.endsWith("Z") ? value : `${value}Z`;
          newObj[key] = new Date(dateString);
        } else if (customRegex.test(value)) {
          // Handle custom format: 2024-09-08 16:39:26.823000
          newObj[key] = new Date(value.replace(" ", "T") + "Z");
        } else {
          newObj[key] = convertDateFields(value);
        }
      } else {
        newObj[key] = convertDateFields(value);
      }
    }
    return newObj;
  }
  return obj;
}
