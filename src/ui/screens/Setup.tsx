// Council Setup (SPEC §7.1 screen 2).
import { useEffect, useRef } from 'react';
import { FACTIONS, type FactionId } from '../../engine';
import { Segmented, Toggle } from '../common';
import { Cog, Sigil, Skull } from '../icons';
import { useGameStore } from '../../store/gameStore';

const TIP: Record<FactionId, string> = {
  archivists: 'Hoard quietly. Cheap Salvage wins the long game, if nobody notices.',
  scrubbers: 'Get paid when others pay. Vent whoever is too rich to refuse.',
  choir: 'Make deals, bind the ones you doubt, and peek before you leap.',
  iron: 'Punish the leader cheaply, and shrug off what the bunker throws at you.',
  wardens: 'Carry the Blight without bleeding, pass it on, and sell the cure.',
  directorate: 'Your ballot counts twice and you break every tie. Votes are your weapon.',
};

export function SetupScreen() {
  const s = useGameStore();
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    row.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, []);
  return (
    <main className="screen setup">
      <div className="noise" aria-hidden="true" />
      <header className="top-bar">
        <button type="button" className="btn btn-small" onClick={() => s.go('title')}>Back</button>
        <h1>Council Setup</h1>
      </header>
      <div className="scroll">
        <h2>Choose your faction</h2>
        <div className="carousel" ref={row} role="radiogroup" aria-label="Faction">
          {FACTIONS.map((f) => (
            <button key={f.id} type="button" role="radio" aria-checked={s.setup.faction === f.id}
              className={s.setup.faction === f.id ? 'faction-card on' : 'faction-card'} style={{ '--accent': f.palette.accent } as React.CSSProperties}
              onClick={() => s.setSetup({ faction: f.id })}>
              <span className="fc-head"><Sigil faction={f.id} size={40} /><b>{f.name}</b></span>
              <span className="fc-pool"><span><Cog size={14} /> {f.start.influence} Influence</span><span><Skull size={14} /> {f.start.lp} LP</span></span>
              <span className="fc-ability"><i>Passive</i> {f.passive.name}: {f.passive.text}</span>
              <span className="fc-ability"><i>Active</i> {f.active.name}: {f.active.text}</span>
              <span className="fc-tip">{TIP[f.id]}</span>
            </button>
          ))}
        </div>
        <Segmented label="Councilors" value={s.setup.playerCount} onChange={(v) => s.setSetup({ playerCount: v })}
          options={[{ value: 4, label: '4' }, { value: 5, label: '5' }, { value: 6, label: '6' }]} />
        <Segmented label="Difficulty" value={s.setup.difficulty} onChange={(v) => s.setSetup({ difficulty: v })}
          options={[{ value: 'easy', label: 'Easy' }, { value: 'normal', label: 'Normal' }, { value: 'merciless', label: 'Merciless' }]} />
        <Segmented label="Whisper timer" value={s.settings.whisperSeconds} onChange={(v) => s.setSettings({ whisperSeconds: v })}
          options={[{ value: 30, label: '30s' }, { value: 45, label: '45s' }, { value: 90, label: '90s' }, { value: 180, label: 'Tabletop' }]} />
        <Toggle label="The Biological Schism" hint="7 expansion cards in Stage II and III" value={s.setup.expansion} onChange={(v) => s.setSetup({ expansion: v })} />
        <Toggle label="Finale deck" hint="A Finale card replaces the turn 9 Mandate" value={s.setup.finale} onChange={(v) => s.setSetup({ finale: v })} />
        <Toggle label="Total Collapse penalty" hint="If Earth Health hits 0, everyone loses half their LP" value={s.setup.collapsePenalty} onChange={(v) => s.setSetup({ collapsePenalty: v })} />
        <Toggle label="First-game tutorial" hint="Coach marks on turn 1" value={s.settings.tutorial} onChange={(v) => s.setSettings({ tutorial: v })} />
      </div>
      <button type="button" className="btn btn-primary wide convene" onClick={s.newGame}>Convene the Council</button>
    </main>
  );
}
