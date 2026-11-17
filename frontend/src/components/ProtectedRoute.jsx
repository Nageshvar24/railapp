import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ role, children }) {
  const token = localStorage.getItem("access");
  const userRole = localStorage.getItem("role");

  if (!token || !userRole) return <Navigate to="/login" replace />;

  if (role && userRole !== role) {
    return <Navigate to={userRole === "admin" ? "/admin/dashboard" : "/home"} replace />;
  }

  return children;
}