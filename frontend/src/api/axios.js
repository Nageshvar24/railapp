import axios from "axios";

// Keep your existing baseURL if it is different
const api = axios.create({
  baseURL: "https://railway-backend-l4yh.onrender.com/api/",
});

// Endpoints that must not receive (or trigger a refresh with) an access token
const PUBLIC_PATHS = ["auth/login/", "auth/register/", "auth/refresh/", "auth/logout/"];
const isPublic = (url = "") => PUBLIC_PATHS.some((p) => url.includes(p));

const goToLogin = () => {
  localStorage.clear();
  window.location.href = "/login";
};

// 1) Attach the access token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access");
  if (token && !isPublic(config.url)) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 2) If the access token has expired, get a new one with the refresh token and retry.
//    One shared request is used so several failing calls refresh only once.
let refreshPromise = null;

const refreshAccessToken = () => {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${api.defaults.baseURL}auth/refresh/`, {
        refresh: localStorage.getItem("refresh"),
      })
      .then((res) => {
        localStorage.setItem("access", res.data.access);
        if (res.data.refresh) localStorage.setItem("refresh", res.data.refresh);
        return res.data.access;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    const expired = error.response?.status === 401 && original && !isPublic(original.url);

    if (!expired) return Promise.reject(error);

    // Already retried once, or there is no refresh token: the session is over
    if (original._retry || !localStorage.getItem("refresh")) {
      goToLogin();
      return Promise.reject(error);
    }

    original._retry = true;
    try {
      const newAccess = await refreshAccessToken();
      original.headers.Authorization = `Bearer ${newAccess}`;
      return api(original);
    } catch (refreshError) {
      goToLogin(); // refresh token also expired or invalid
      return Promise.reject(refreshError);
    }
  }
);

export default api;