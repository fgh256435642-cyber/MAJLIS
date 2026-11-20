import { AuthScreen } from './components/AuthScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MajlisBrandIcon } from './components/NexusLogo';
import { NexusWorkspace } from './components/NexusWorkspace';
import { ToastContainer } from './components/ToastContainer';
import { NexusTooltipProvider } from './components/ui/NexusUI';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import { UserSettingsProvider } from './hooks/useUserSettings';

function NexusRoot() {
  const { firebaseUser, authReady, needsVerification, language } = useAuth();

  if (!authReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 dark:bg-[#1E1F22] text-slate-900 dark:text-white gap-3">
        <div className="w-12 h-12 rounded-2xl bg-nexus text-white flex items-center justify-center animate-pulse">
          <MajlisBrandIcon className="w-6 h-6" />
        </div>
        <span className="text-sm font-medium text-slate-500 dark:text-zinc-400">
          {language === 'ar' ? 'جاري تحميل مجلس...' : 'Loading MAJLIS...'}
        </span>
      </div>
    );
  }

  if (!firebaseUser || needsVerification) {
    return <AuthScreen />;
  }

  return <NexusWorkspace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <UserSettingsProvider>
            <NexusTooltipProvider>
              <NexusRoot />
              <ToastContainer />
            </NexusTooltipProvider>
          </UserSettingsProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
