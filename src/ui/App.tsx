import { motion } from 'framer-motion';
import { CARDS, FACTIONS } from '../engine';

// M0 placeholder title screen. The real screens (SPEC §7) arrive in M4.
export function App() {
  return (
    <main className="screen title-screen">
      <div className="noise" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <motion.div
        className="title-block"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      >
        <p className="broadcast">“This is the last broadcast. The surface is gone. The Council convenes.”</p>
        <h1 className="wordmark">
          ZERO
          <br />
          COUNCIL
        </h1>
        <p className="tagline">There are no winners.</p>
      </motion.div>
      <nav className="menu" aria-label="Main menu">
        <button className="btn btn-primary" disabled>Enter the Bunker</button>
        <button className="btn" disabled>Continue</button>
        <button className="btn" disabled>Codex</button>
        <button className="btn" disabled>Settings</button>
      </nav>
      <p className="build-note">
        Prototype scaffold · {CARDS.length} cards · {FACTIONS.length} factions loaded
      </p>
    </main>
  );
}
