import React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import { AuthProvider } from "./contexts/AuthContext";
import { NotificationsProvider } from "./contexts/NotificationsContext";
import { ChatProvider } from "./contexts/ChatContext";
import { PaymentProvider } from "./contexts/PaymentContext";

import SplashPage from "./pages/SplashPage";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import PaymentPage from "./pages/PaymentPage";
import HistoryPage from "./pages/HistoryPage";
import NotificationsPage from "./pages/NotificationsPage";
import ProfilePage from "./pages/ProfilePage";
import ChatPage from "./pages/ChatPage";
import DrinksPage from "./pages/DrinksPage";

import DashboardLayout from "./components/layout/DashboardLayout";
import ProtectedRoute from "./components/auth/ProtectedRoute";

const App: React.FC = () => {
  return (
    <AuthProvider>
      <NotificationsProvider>
        <PaymentProvider>
          <ChatProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<SplashPage />} />
                <Route path="/login" element={<LoginPage />} />

                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <DashboardLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<Navigate to="home" replace />} />
                  <Route path="home" element={<HomePage />} />
                  <Route path="payment" element={<PaymentPage />} />
                  <Route path="drinks" element={<DrinksPage />} />
                  <Route path="history" element={<HistoryPage />} />
                  <Route path="notifications" element={<NotificationsPage />} />
                  <Route path="chat" element={<ChatPage />} />
                  <Route path="profile" element={<ProfilePage />} />
                  <Route path="profile/:userId" element={<ProfilePage />} />
                </Route>

                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </BrowserRouter>
          </ChatProvider>
        </PaymentProvider>
      </NotificationsProvider>
    </AuthProvider>
  );
};

export default App;
