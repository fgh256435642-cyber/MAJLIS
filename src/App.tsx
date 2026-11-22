import { AuthScreen } from './components/AuthScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MajlisBrandIcon } from './components/MajlisLogo';
import { MajlisWorkspace } from './components/MajlisWorkspace';
import { ToastContainer } from './components/ToastContainer';
import { MajlisTooltipProvider } from './components/ui/MajlisUI';
import { ImagePreviewProvider } from './components/ImagePreview';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { ToastProvider } from './hooks/useToast';
import { UserSettingsProvider } from './hooks/useUserSettings';

function MajlisRoot() {
  const { firebaseUser, authReady, needsVerification, language } = useAuth();

  if (!authReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-main dark:bg-main text-text dark:text-text gap-3">
        <div className="w-12 h-12 flex items-center justify-center animate-pulse">
          <MajlisBrandIcon className="w-6 h-6" />
        </div>
        <span className="text-link font-medium text-text-muted dark:text-text-muted">
          {language === 'ar' ? 'جاري تحميل مجلس...' : 'Loading MAJLIS...'}
        </span>
      </div>
    );
  }

  if (!firebaseUser || needsVerification) {
    return <AuthScreen />;
  }

  return <MajlisWorkspace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <UserSettingsProvider>
            <ImagePreviewProvider>
              <MajlisTooltipProvider>
                <MajlisRoot />
                <ToastContainer />
              </MajlisTooltipProvider>
            </ImagePreviewProvider>
          </UserSettingsProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
