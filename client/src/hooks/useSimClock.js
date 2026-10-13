import { useEffect, useRef, useState } from "react";

const FLUSH_MS = 250; // how often we push the simulated time into React state

/**
 * A clock that runs at `speed`x real time, so a satellite that circles Earth
 * every ~90 minutes visibly moves within seconds. Position math always uses
 * this simulated Date, never Date.now() directly, so pausing/speed changes
 * are consistent everywhere that reads it.
 */
export function useSimClock(initialSpeed = 200) {
  const [simTime, setSimTime] = useState(() => new Date());
  const [speed, setSpeed] = useState(initialSpeed);
  const [running, setRunning] = useState(true);

  const simMsRef = useRef(Date.now());
  const lastRealMsRef = useRef(performance.now());
  const speedRef = useRef(speed);
  const runningRef = useRef(running);
  const lastFlushRef = useRef(0);
  const rafRef = useRef(null);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    runningRef.current = running;
  }, [running]);

  useEffect(() => {
    function tick(nowReal) {
      const deltaReal = nowReal - lastRealMsRef.current;
      lastRealMsRef.current = nowReal;

      if (runningRef.current) {
        simMsRef.current += deltaReal * speedRef.current;
      }

      if (nowReal - lastFlushRef.current > FLUSH_MS) {
        lastFlushRef.current = nowReal;
        setSimTime(new Date(simMsRef.current));
      }

      rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  function resetToNow() {
    simMsRef.current = Date.now();
    setSimTime(new Date(simMsRef.current));
  }

  return {
    simTime,
    speed,
    setSpeed,
    running,
    toggleRunning: () => setRunning((r) => !r),
    resetToNow,
  };
}
