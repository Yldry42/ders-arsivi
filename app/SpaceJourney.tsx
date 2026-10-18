'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import Image from 'next/image';

const milestones = [
  { at: 0, name: 'Uydu', icon: 'satellite', color: '#2563eb' },
  { at: 0.2, name: 'Roket', icon: 'rocket', color: '#7c3aed' },
  { at: 0.36, name: 'Atmosfer', icon: 'atmosphere', color: '#0891b2' },
  { at: 0.52, name: 'Gözlemevi', icon: 'observatory', color: '#475569' },
  { at: 0.75, name: 'Anten', icon: 'antenna', color: '#059669' },
  { at: 0.93, name: 'Roket', icon: 'rocket', color: '#ea580c' },
] as const;

type JourneyIconName = (typeof milestones)[number]['icon'];

function JourneyIcon({ name }: { name: JourneyIconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

  switch (name) {
    case 'satellite':
      return <svg viewBox="0 0 32 32" aria-hidden="true" {...common}><path d="m12 12 8 8m-6-7 5-5 5 5-5 5-5-5ZM3 10l6-6 6 6-6 6-6-6Zm14 13 6-6 6 6-6 6-6-6Z" /><path d="m19 23 5 5M20 12l4-4" /></svg>;
    case 'atmosphere':
      return <svg viewBox="0 0 32 32" aria-hidden="true" {...common}><path d="M3 25c6-7 20-7 26 0M5 21c6-9 16-9 22 0M9 17c4-5 10-5 14 0" /><path d="M16 5v3M11 7l1 2M21 7l-1 2" /></svg>;
    case 'observatory':
      return <svg viewBox="0 0 32 32" aria-hidden="true" {...common}><path d="M5 25h22M8 25V16a8 8 0 0 1 16 0v9M6 16h20M16 8v8M11 25v-5h4v5M20 25v-5h3v5" /><path d="m16 8 3-3" /></svg>;
    case 'antenna':
      return <svg viewBox="0 0 32 32" aria-hidden="true" {...common}><path d="M5 9c1 9 9 14 18 10M8 8l15 11M19 18l-4 8M11 27h11M22 12c3 1 5 3 5 6M23 7c4 1 7 5 7 9" /></svg>;
    case 'rocket':
      return <svg viewBox="0 0 32 32" aria-hidden="true" {...common}><path d="M16 3c5 4 6 10 5 18l-5 4-5-4C10 13 11 7 16 3ZM11 19l-4 4v4l6-3m8-5 4 4v4l-6-3M16 25v5M13 29l3-4 3 4" /><circle cx="16" cy="14" r="2.5" /></svg>;
  }
}

function SpaceOpening({ dark = false }: { dark?: boolean }) {
  return (
    <div className="journey-space-scene absolute inset-x-0 top-0 h-[72rem]">
      {!dark && <Image src="/journey-space.webp" alt="" width={1672} height={941} unoptimized className="journey-scenery w-full" />}
      <Image src="/journey-astronaut.webp" alt="" width={1312} height={1199} unoptimized className="journey-float journey-astronaut absolute left-[2%] top-[19rem] w-[clamp(5rem,9vw,8rem)]" />
      <Image src="/journey-turksat.webp" alt="" width={1774} height={887} unoptimized className="journey-float journey-float-late journey-turksat absolute right-[3%] top-[24rem] w-[clamp(9rem,15vw,14rem)]" />
      <Image src="/journey-gokturk.webp" alt="" width={1536} height={1024} unoptimized className="journey-float journey-float-slow journey-gokturk absolute right-[7%] top-[32rem] w-[clamp(6rem,11vw,9rem)]" />
      <Image src="/journey-cubesat.webp" alt="" width={640} height={726} unoptimized className="journey-float journey-float-slow journey-cubesat absolute left-[5%] top-[14rem] w-[clamp(2.25rem,3vw,3rem)]" />
      <Image src="/journey-nanosat.webp" alt="" width={960} height={573} unoptimized className="journey-float journey-float-late journey-nanosat absolute right-[2.5%] top-[15rem] w-[clamp(5.5rem,7vw,7rem)]" />
      <Image src="/journey-gold-satellite.webp" alt="" width={800} height={719} unoptimized className="journey-float journey-gold-satellite absolute left-[1%] top-[29rem] w-[clamp(6rem,9vw,8rem)]" />
    </div>
  );
}

export function JourneyBackdrop() {
  return (
    <div className="journey-backdrop journey-backdrop--descent pointer-events-none absolute bottom-0 top-0 z-0 overflow-hidden" aria-hidden="true">
      <SpaceOpening />
      <div className="journey-atmosphere-scene absolute inset-x-0 top-[18%] h-[32%]">
        <Image src="/journey-meteor.webp" alt="" width={1536} height={1024} unoptimized className="journey-meteor journey-meteor-one absolute left-[3%] top-[9%] w-[clamp(8rem,14vw,15rem)]" />
        <Image src="/journey-meteor.webp" alt="" width={1536} height={1024} unoptimized className="journey-meteor journey-meteor-two absolute right-[4%] top-[38%] w-[clamp(7rem,12vw,13rem)]" />
        <Image src="/journey-meteor.webp" alt="" width={1536} height={1024} unoptimized className="journey-meteor journey-meteor-three absolute left-[9%] top-[72%] w-[clamp(5rem,9vw,9rem)]" />
      </div>
      <div className="journey-earth-scene absolute inset-x-0 bottom-0 top-[50%]">
        <Image src="/journey-earth-launch.webp" alt="" width={1024} height={1536} unoptimized className="absolute h-full w-full" />
      </div>
    </div>
  );
}

export function SpaceOnlyBackdrop() {
  return (
    <div className="journey-backdrop journey-backdrop--space-only pointer-events-none absolute bottom-0 top-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="journey-night-stars journey-day-stars absolute inset-0" />
      <SpaceOpening />
    </div>
  );
}

export function NightSpaceBackdrop() {
  return (
    <div className="journey-backdrop journey-backdrop--night pointer-events-none absolute bottom-0 top-0 z-0 overflow-hidden" aria-hidden="true">
      <div className="journey-night-stars absolute inset-0" />
      <SpaceOpening dark />
    </div>
  );
}

export function JourneyFinalScene() {
  return (
    <div className="journey-final-scene pointer-events-none relative z-0 mt-4 h-[clamp(15rem,39vw,29rem)]" aria-hidden="true" />
  );
}

export function JourneyProgress() {
  const [progress, setProgress] = useState(0);
  const draggingPointer = useRef<number | null>(null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        setProgress(Math.min(1, Math.max(0, window.scrollY / maxScroll)));
      });
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);

  const current = [...milestones].reverse().find((item) => progress >= item.at) ?? milestones[0];
  const scrollToProgress = (value: number) => {
    const next = Math.min(1, Math.max(0, value));
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    setProgress(next);
    window.scrollTo(0, next * maxScroll);
  };
  const scrollFromPointer = (clientY: number, track: HTMLDivElement) => {
    const bounds = track.getBoundingClientRect();
    scrollToProgress((clientY - bounds.top) / bounds.height);
  };
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    draggingPointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    scrollFromPointer(event.clientY, event.currentTarget);
  };
  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (draggingPointer.current !== event.pointerId) return;
    scrollFromPointer(event.clientY, event.currentTarget);
  };
  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (draggingPointer.current !== event.pointerId) return;
    draggingPointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const changes: Record<string, number> = {
      ArrowDown: 0.025,
      ArrowRight: 0.025,
      ArrowUp: -0.025,
      ArrowLeft: -0.025,
      PageDown: 0.1,
      PageUp: -0.1,
    };
    if (event.key === 'Home' || event.key === 'End' || event.key in changes) {
      event.preventDefault();
      scrollToProgress(event.key === 'Home' ? 0 : event.key === 'End' ? 1 : progress + changes[event.key]);
    }
  };

  return (
    <div className="journey-progress pointer-events-none fixed right-6 top-1/2 z-20 hidden -translate-y-1/2 md:block">
      <div className="journey-progress-track pointer-events-auto relative h-[min(68vh,34rem)] w-[3px] touch-none cursor-pointer rounded-full bg-slate-950" onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerEnd} onPointerCancel={handlePointerEnd}>
        <span className="absolute inset-x-0 bottom-0 rounded-b-full transition-colors duration-500" style={{ top: `${progress * 100}%`, backgroundColor: current.color }} />
        <button type="button" role="slider" aria-label="Uzaydan yeryüzüne yolculukta gezin" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-valuetext={current.name} onKeyDown={handleKeyDown} className="journey-progress-thumb absolute left-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-slate-950 bg-slate-950 p-2 text-white shadow-md cursor-grab active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500" style={{ top: `${progress * 100}%` }} title={current.name}>
          <JourneyIcon name={current.icon} />
        </button>
      </div>
    </div>
  );
}
