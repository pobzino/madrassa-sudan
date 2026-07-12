import { registerRoot } from 'remotion';
// Order matters: the app's real stylesheet first (Tailwind v4 + slide
// keyframes + the [dir="rtl"] Cairo rule), then the Remotion overrides that
// freeze wall-clock CSS animations.
import '../src/app/globals.css';
import './style.css';
import { RemotionRoot } from './Root';

registerRoot(RemotionRoot);
