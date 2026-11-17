import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Registration from "./user/Registration.jsx";
import Login from "./user/login.jsx";
import UserDashboard from "./user/UserDashboard.jsx";
import BookTicket from "./user/BookTicket.jsx";
import BookingConfirmation from "./user/BookingConfirmation.jsx";
import MyBookings from "./user/MyBookings.jsx";
import AdminDashboard from "./admin/AdminDashboard.jsx";
import Trains from "./admin/Trains.jsx";
import Stations from "./admin/Stations.jsx";
import Layout from "./components/Layout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import RecentBooking from "./admin/RecentBooking.jsx";
import Refund from "./admin/Refund.jsx";
import Users from "./admin/Users.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/register" element={<Registration />} />
        <Route path="/login" element={<Login />} />

        {/* User pages */}
        <Route
          path="/home"
          element={
            <ProtectedRoute role="user">
              <UserDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/book"
          element={
            <ProtectedRoute role="user">
              <BookTicket />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ticket/:pnr"
          element={
            <ProtectedRoute role="user">
              <BookingConfirmation />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-bookings"
          element={
            <ProtectedRoute role="user">
              <MyBookings />
            </ProtectedRoute>
          }
        />

        {/* Admin: pages render inside the Layout <Outlet /> */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute role="admin">
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="trains" element={<Trains />} />
          <Route path="stations" element={<Stations />} />
          <Route path="bookings" element={<RecentBooking />} />
          <Route path="refunds" element={<Refund />} />
          <Route path="users" element={<Users />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}