import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { CompanyScopeProvider } from "@/contexts/CompanyScopeContext";
import ThemeToggle from "@/components/ThemeToggle";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Vehicles from "@/pages/Vehicles";
import Drivers from "@/pages/Drivers";
import Customers from "@/pages/Customers";
import RoutesPage from "@/pages/RoutesPage";
import Faults from "@/pages/Faults";
import VehicleHandover from "@/pages/VehicleHandover";
import Documents from "@/pages/Documents";
import Accidents from "@/pages/Accidents";
import Reports from "@/pages/Reports";
import Roadmap from "@/pages/Roadmap";
import Settings from "@/pages/Settings";
import AttachCar from "@/pages/AttachCar";
import Alerts from "@/pages/Alerts";
import HistoryPage from "@/pages/History";
import ServiceOrders from "@/pages/ServiceOrders";
import Expenses from "@/pages/Expenses";
import WorkOrders from "@/pages/WorkOrders";
import Emergency from "@/pages/Emergency";
import DriverNotifications from "@/pages/DriverNotifications";
import DriverWeeklySchedule from "@/pages/DriverWeeklySchedule";
import UserManagement from "@/pages/UserManagement";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import About from "@/pages/About";
import NotFound from "./pages/NotFound";
import ProjectSummary from "@/pages/ProjectSummary";
import CompletedTasks from "@/pages/CompletedTasks";
import VehicleInspections from "@/pages/VehicleInspections";
import VehicleTasks from "@/pages/VehicleTasks";
import HealthDeclaration from "@/pages/HealthDeclaration";
import VehicleImport from "@/pages/VehicleImport";
import PrivateVehicleInspection from "@/pages/PrivateVehicleInspection";
import VehicleLookup from "@/pages/VehicleLookup";
import VehicleExchange from "@/pages/VehicleExchange";
import DevVehicleHubPreview from "@/pages/DevVehicleHubPreview";
import DevVehicleFlowsPreview from "@/pages/DevVehicleFlowsPreview";
import DevVehicleNewFormPreview from "@/pages/DevVehicleNewFormPreview";
import DevVehicleNewFormFullPreview from "@/pages/DevVehicleNewFormFullPreview";
import DevVehicleNewStep2Vision from "@/pages/DevVehicleNewStep2Vision";
import DevVehicleNewFormDalia from "@/pages/DevVehicleNewFormDalia";
import DevVehicleFormLive from "@/pages/DevVehicleFormLive";
import DevVehiclesListPreview from "@/pages/DevVehiclesListPreview";
import DevFleetManagerDriverFlow from "@/pages/DevFleetManagerDriverFlow";
import DevFaultsScopedPreview from "@/pages/DevFaultsScopedPreview";
import DevDocumentsScopedPreview from "@/pages/DevDocumentsScopedPreview";
import DevStagingProofFlow from "@/pages/DevStagingProofFlow";

// New pages
import Companions from "@/pages/Companions";
import Towing from "@/pages/Towing";
import Permissions from "@/pages/Permissions";
import AlertSettings from "@/pages/AlertSettings";
import ApprovalSettings from "@/pages/ApprovalSettings";
import Suppliers from "@/pages/Suppliers";
import SupplierOrders from "@/pages/SupplierOrders";
import EmailTemplates from "@/pages/EmailTemplates";
import Promotions from "@/pages/Promotions";
import InternalChat from "@/pages/InternalChat";
import Subscriptions from "@/pages/Subscriptions";
import EmergencySettings from "@/pages/EmergencySettings";
import CustomerDocs from "@/pages/CustomerDocs";
import DriverDeclarations from "@/pages/DriverDeclarations";
import SignDeclaration from "@/pages/SignDeclaration";

import ServiceOrderHistory from "@/pages/ServiceOrderHistory";
import TakeDrivingExam from "@/pages/TakeDrivingExam";
import Voice from "@/pages/Voice";
import PickupAppointments from "@/pages/PickupAppointments";
import VehicleTracking from "@/pages/VehicleTracking";
import AdminHome from "@/pages/AdminHome";
import FleetManagers from "@/pages/FleetManagers";

const queryClient = new QueryClient();

function AppRoutes() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground text-lg">טוען...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/dev/vehicle-card" element={<DevVehicleHubPreview />} />
        <Route path="/dev/vehicle-flows" element={<DevVehicleFlowsPreview />} />
        <Route path="/dev/vehicle-new-form" element={<DevVehicleNewFormPreview />} />
        <Route path="/dev/vehicle-new-form-full" element={<DevVehicleNewFormFullPreview />} />
        <Route path="/dev/vehicle-new-step2-vision" element={<DevVehicleNewStep2Vision />} />
        <Route path="/dev/vehicle-new-dalia" element={<DevVehicleNewFormDalia />} />
        <Route path="/dev/vehicle-form-live" element={<DevVehicleFormLive />} />
        <Route path="/dev/vehicle-form-live/full" element={<DevVehicleFormLive initialStep="full" mockGov openAllSections />} />
        <Route path="/dev/vehicle-form-live/edit" element={<DevVehicleFormLive editPreview initialStep="full" openAllSections />} />
        <Route path="/dev/faults-scoped" element={<DevFaultsScopedPreview />} />
        <Route path="/dev/documents-scoped" element={<DevDocumentsScopedPreview />} />
        <Route path="/dev/staging-proof-flow" element={<DevStagingProofFlow />} />
        <Route path="/dev/vehicles-list" element={<DevVehiclesListPreview />} />
        <Route path="/dev/fleet-manager-driver-flow" element={<DevFleetManagerDriverFlow />} />
        <Route path="/about" element={<About />} />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/sign-declaration" element={<SignDeclaration />} />
        <Route path="/take-exam" element={<TakeDrivingExam />} />
        <Route path="*" element={<About />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/dev/vehicle-card" element={<DevVehicleHubPreview />} />
      <Route path="/dev/vehicle-flows" element={<DevVehicleFlowsPreview />} />
      <Route path="/dev/vehicle-new-form" element={<DevVehicleNewFormPreview />} />
      <Route path="/dev/vehicle-new-form-full" element={<DevVehicleNewFormFullPreview />} />
      <Route path="/dev/vehicle-new-step2-vision" element={<DevVehicleNewStep2Vision />} />
      <Route path="/dev/vehicle-form-live" element={<DevVehicleFormLive />} />
      <Route path="/dev/vehicle-form-live/full" element={<DevVehicleFormLive initialStep="full" mockGov openAllSections />} />
      <Route path="/dev/vehicle-form-live/edit" element={<DevVehicleFormLive editPreview initialStep="full" openAllSections />} />
      <Route path="/dev/faults-scoped" element={<DevFaultsScopedPreview />} />
      <Route path="/dev/documents-scoped" element={<DevDocumentsScopedPreview />} />
      <Route path="/dev/staging-proof-flow" element={<DevStagingProofFlow />} />
      <Route path="/dev/vehicles-list" element={<DevVehiclesListPreview />} />
      <Route path="/dev/fleet-manager-driver-flow" element={<DevFleetManagerDriverFlow />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<Navigate to="/dashboard" replace />} />
      <Route element={<Layout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/vehicle-tracking" element={<VehicleTracking />} />
        <Route path="/admin-home" element={<AdminHome />} />
        <Route path="/fleet-managers" element={<FleetManagers />} />
        <Route path="/vehicles" element={<Vehicles />} />
        <Route path="/drivers" element={<Drivers />} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/routes" element={<RoutesPage />} />
        <Route path="/faults" element={<Faults />} />
        <Route path="/handover" element={<VehicleHandover />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/accidents" element={<Accidents />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/roadmap" element={<Roadmap />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/attach-car" element={<AttachCar />} />
        <Route path="/attach-customer" element={<AttachCar />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/service-orders" element={<ServiceOrders />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/work-orders" element={<WorkOrders />} />
        <Route path="/emergency" element={<Emergency />} />
        <Route path="/driver-notifications" element={<DriverNotifications />} />
        <Route path="/driver-schedule" element={<DriverWeeklySchedule />} />
        <Route path="/user-management" element={<UserManagement />} />
        {/* New routes */}
        <Route path="/companions" element={<Companions />} />
        <Route path="/towing" element={<Towing />} />
        <Route path="/permissions" element={<Permissions />} />
        <Route path="/alert-settings" element={<AlertSettings />} />
        <Route path="/approval-settings" element={<ApprovalSettings />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/supplier-orders" element={<SupplierOrders />} />
        <Route path="/email-templates" element={<EmailTemplates />} />
        <Route path="/promotions" element={<Promotions />} />
        <Route path="/internal-chat" element={<InternalChat />} />
        <Route path="/subscriptions" element={<Subscriptions />} />
        <Route path="/customer-docs" element={<CustomerDocs />} />
        <Route path="/emergency-settings" element={<EmergencySettings />} />
        <Route path="/system-logs" element={<Alerts />} />
        <Route path="/service-order-history" element={<ServiceOrderHistory />} />
        <Route path="/project-summary" element={<ProjectSummary />} />
        <Route path="/completed-tasks" element={<CompletedTasks />} />
        <Route path="/vehicle-inspections" element={<VehicleInspections />} />
        <Route path="/vehicle-tasks" element={<VehicleTasks />} />
        <Route path="/health-declaration" element={<HealthDeclaration />} />
        <Route path="/vehicle-import" element={<VehicleImport />} />
        <Route path="/private-vehicle-inspection" element={<PrivateVehicleInspection />} />
        <Route path="/vehicle-lookup" element={<VehicleLookup />} />
        <Route path="/vehicle-exchange" element={<VehicleExchange />} />
        <Route path="/driver-declarations" element={<DriverDeclarations />} />
        <Route path="/sign-declaration" element={<SignDeclaration />} />
        <Route path="/take-exam" element={<TakeDrivingExam />} />
        <Route path="/driving-exam/:id" element={<TakeDrivingExam />} />
        <Route path="/voice" element={<Voice />} />
        <Route path="/pickup-appointments" element={<PickupAppointments />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <AuthProvider>
            <CompanyScopeProvider>
              <ThemeToggle />
              <AppRoutes />
            </CompanyScopeProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
