import { useGameStore } from '../store/gameStore';
import { CodexScreen } from './screens/Codex';
import { EndScreen } from './screens/End';
import { GameScreen } from './screens/Game';
import { SettingsScreen } from './screens/Settings';
import { SetupScreen } from './screens/Setup';
import { TitleScreen } from './screens/Title';

export function App() {
  const screen = useGameStore((s) => s.screen);
  const hasGame = useGameStore((s) => s.game !== null);
  switch (screen) {
    case 'setup': return <SetupScreen />;
    case 'game': return hasGame ? <GameScreen /> : <TitleScreen />;
    case 'codex': return <CodexScreen />;
    case 'settings': return <SettingsScreen />;
    case 'end': return hasGame ? <EndScreen /> : <TitleScreen />;
    default: return <TitleScreen />;
  }
}
