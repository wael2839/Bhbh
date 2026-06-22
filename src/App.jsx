import MudadDashboard from "./MudadDashboard.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

export default function App() {
  return (
    <ErrorBoundary>
      <MudadDashboard />
    </ErrorBoundary>
  );
}
