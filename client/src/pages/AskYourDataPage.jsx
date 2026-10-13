import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Send, Volume2, VolumeX, RotateCcw, Database, AlertCircle, Sparkles, Globe } from "lucide-react";
import { suggestedQuestions, LANGUAGES } from "../data/mockAsk";
import { askQuestion } from "../lib/askApi";
import { playTingSound } from "../lib/notificationSound";

const MAX_QUESTIONS = 5;
const RESET_MS = 7 * 60 * 1000; // 7 minutes
const STORAGE_KEY = "askYourData_session";

function loadSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { count: 0, sessionStart: null };
    const { count, sessionStart } = JSON.parse(raw);

    if (sessionStart && Date.now() - sessionStart >= RESET_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return { count: 0, sessionStart: null };
    }
    return { count, sessionStart };
  } catch {
    return { count: 0, sessionStart: null };
  }
}

function saveSession(count, sessionStart) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ count, sessionStart }));
}

const THINKING_STEPS = [
  "Parsing your question...",
  "Generating SQL against the golden dataset...",
  "Running the query in DuckDB...",
  "Formatting the answer...",
];

function formatCountdown(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function AskYourDataPage() {
  const [input, setInput] = useState("");
  const [justTranscribed, setJustTranscribed] = useState(false);
  const [phase, setPhase] = useState("idle");
  const [thinkingStepIndex, setThinkingStepIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [lang, setLang] = useState("en-IN");

  const initialSession = loadSession();
  const [count, setCount] = useState(initialSession.count);
  const [sessionStart, setSessionStart] = useState(initialSession.sessionStart);
  const [countdownMs, setCountdownMs] = useState(0);

  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [resetToast, setResetToast] = useState(false);
  const recognitionRef = useRef(null);
  const thinkingIntervalRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((r) => r[0].transcript).join("");
      setInput(transcript);
    };
    recognition.onend = () => {
      setListening(false);
      setJustTranscribed(true);
    };
    recognitionRef.current = recognition;
  }, [lang]);

  useEffect(() => {
    if (!sessionStart) return;

    const tick = () => {
      const remaining = RESET_MS - (Date.now() - sessionStart);
      if (remaining <= 0) {
        setCount(0);
        setSessionStart(null);
        saveSession(0, null);
        setCountdownMs(0);
        setResetToast(true);
        playTingSound();
        setTimeout(() => setResetToast(false), 6000);
      } else {
        setCountdownMs(remaining);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [sessionStart]);

  function toggleListening() {
    if (!speechSupported || count >= MAX_QUESTIONS) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      setInput("");
      recognitionRef.current.start();
      setListening(true);
    }
  }

  async function handleAsk(question) {
    const q = question ?? input;
    if (!q.trim() || count >= MAX_QUESTIONS) return;

    setPhase("thinking");
    setThinkingStepIndex(0);
    thinkingIntervalRef.current = setInterval(() => {
      setThinkingStepIndex((i) => Math.min(i + 1, THINKING_STEPS.length - 1));
    }, 900);

    try {
      const data = await askQuestion(q);
      setResult({
        question: q,
        answer: data.answer,
        supportingData: data.results.length > 0
          ? Object.entries(data.results[0]).slice(0, 4).map(([label, value]) => ({ label, value: String(value) }))
          : [],
        source: `${data.sql} (via ${data.provider})`,
        chartUrl: data.chart_url || null,
        isFallback: false,
      });
    } catch (err) {
      setResult({
        question: q,
        answer: err.message || "Something went wrong answering this question.",
        supportingData: [],
        source: null,
        isFallback: true,
      });
    }

    clearInterval(thinkingIntervalRef.current);

    const newCount = count + 1;
    setCount(newCount);

    if (newCount >= MAX_QUESTIONS && !sessionStart) {
      const start = Date.now();
      setSessionStart(start);
      saveSession(newCount, start);
    } else {
      saveSession(newCount, sessionStart);
    }

    setPhase("answered");
  }

  function handleAskAnother() {
    setResult(null);
    setInput("");
    setPhase("idle");
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }

  function speakText(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    utterance.onend = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  // FIX (frontend safety net, alongside the real backend fix): if a
  // non-English answer ever slips through despite the backend prompt
  // fix, an English voice engine can't pronounce it - it silently
  // skips foreign script and only reads digits, producing exactly the
  // garbled "numbers only" audio that was reported. Better to warn and
  // decline than play broken audio.
  function isMostlyEnglish(text) {
    const nonAscii = text.match(/[^\x00-\x7F]/g) || [];
    return nonAscii.length < text.length * 0.1;
  }

  function playAnswer() {
    if (!result?.answer) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    if (!isMostlyEnglish(result.answer)) {
      setSpeaking(false);
      alert("This answer isn't in English, so it can't be read aloud reliably. Please try asking again.");
      return;
    }
    speakText(result.answer);
  }

  function localizedQuestion(sq) {
    if (lang === "en-IN") return sq.question;
    return sq.translations[lang]?.question || sq.question;
  }

  const remaining = MAX_QUESTIONS - count;
  const limitReached = remaining <= 0;

  return (
    <div className="flex flex-col h-full w-full min-w-0 overflow-y-auto px-6 py-6">
      <div className="mb-5">
        <p className="text-[11px] font-mono tracking-[0.15em] uppercase text-ink-400">
          GEOINT / Ask Your Data
        </p>
        <h1 className="mt-1 font-display text-xl font-semibold text-white">Ask Your Data</h1>
        <p className="mt-1 text-sm text-ink-400">
          Ask a question in plain English or by voice — answered live from the real golden dataset.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-ink-700/60 bg-ink-900/40 backdrop-blur-md px-4 py-2.5">
        <Globe size={14} className="shrink-0 text-ink-400" />
        <span className="text-[12px] text-ink-400">You can speak or type in:</span>
        <div className="flex flex-wrap gap-1.5">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                lang === l.code
                  ? "border-signal-teal bg-signal-teal/15 text-signal-teal"
                  : "border-ink-700 text-ink-400 hover:text-white"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {resetToast && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mb-4 flex items-center gap-2 rounded-lg border border-signal-teal/40 bg-signal-teal/10 px-4 py-2.5 text-xs text-signal-teal"
          >
            <RotateCcw size={13} />
            Your session has been reset — you can ask {MAX_QUESTIONS} more questions now.
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-ink-900/40 backdrop-blur-md border border-ink-700/50 rounded-xl shadow-lg shadow-black/20 p-5">
        <AnimatePresence mode="wait">
          {phase !== "answered" ? (
            <motion.div
              key="input"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-[12px] text-ink-400">
                  {remaining} of {MAX_QUESTIONS} questions remaining this session
                </span>
                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-ink-800">
                  <div
                    className="h-full rounded-full bg-signal-teal transition-all"
                    style={{ width: `${(count / MAX_QUESTIONS) * 100}%` }}
                  />
                </div>
              </div>

              {limitReached && (
                <div className="flex items-center justify-between gap-2 px-4 py-3 mb-4 text-[12px] border rounded-lg border-signal-amber/40 bg-signal-amber/10 text-signal-amber">
                  <div className="flex items-start gap-2">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    You've reached your limit for this session.
                  </div>
                  <span className="font-mono text-sm font-semibold shrink-0">
                    Resets in {formatCountdown(countdownMs)}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap gap-2 mb-4">
                {suggestedQuestions.map((sq) => (
                  <button
                    key={sq.question}
                    onClick={() => handleAsk(localizedQuestion(sq))}
                    disabled={limitReached || phase === "thinking"}
                    className="rounded-full border border-ink-700 px-3 py-1.5 text-[12px] text-ink-300 hover:border-signal-teal/50 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {localizedQuestion(sq)}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-800/40 px-3 py-2.5">
                <input
                  value={input}
                  onChange={(e) => { setInput(e.target.value); setJustTranscribed(false); }}
                  onKeyDown={(e) => e.key === "Enter" && handleAsk()}
                  placeholder={
                    limitReached ? "You've used all 5 questions for this session"
                    : listening ? "Listening — speak your question..."
                    : "Type or speak your question..."
                  }
                  disabled={limitReached}
                  className="flex-1 text-sm bg-transparent outline-none text-ink-100 placeholder:text-ink-500 disabled:cursor-not-allowed"
                />
                {speechSupported && (
                  <button
                    onClick={toggleListening}
                    disabled={limitReached}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
                      listening ? "bg-signal-red text-white" : "text-ink-400 hover:bg-ink-700"
                    }`}
                  >
                    <Mic size={15} />
                  </button>
                )}
                <button
                  onClick={() => { setJustTranscribed(false); handleAsk(); }}
                  disabled={!input.trim() || limitReached || phase === "thinking"}
                  className="flex items-center justify-center w-8 h-8 rounded-full bg-signal-teal text-ink-950 hover:scale-105 transition-transform disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send size={14} />
                </button>
              </div>

              {justTranscribed && input && (
                <p className="mt-2 text-[11px] text-signal-amber">
                  Please check the transcribed text before sending — voice recognition can occasionally mishear a word.
                </p>
              )}
              {!speechSupported && (
                <p className="mt-2 text-[11px] text-ink-500">
                  Voice input isn't supported in this browser — try Chrome for speech-to-text.
                </p>
              )}

              {phase === "thinking" && (
                <div className="mt-4 space-y-1.5">
                  {THINKING_STEPS.map((step, i) => (
                    <div key={step} className={`flex items-center gap-2 text-[12px] ${i <= thinkingStepIndex ? "text-signal-teal" : "text-ink-600"}`}>
                      <Sparkles size={11} className={i === thinkingStepIndex ? "animate-pulse" : ""} />
                      {step}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="answer"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <p className="text-[12px] text-ink-400">You asked</p>
              <p className="mt-1 text-sm font-medium text-white">{result.question}</p>

              <div className={`mt-4 rounded-lg border p-4 ${result.isFallback ? "border-signal-amber/40 bg-signal-amber/10" : "border-signal-teal/30 bg-signal-teal/5"}`}>
                {result.isFallback && (
                  <p className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-signal-amber">
                    <AlertCircle size={13} /> Couldn't get a database-backed answer
                  </p>
                )}
                <p className="text-[15px] leading-relaxed text-ink-100">{result.answer}</p>
                <p className="mt-1 text-[10px] text-ink-500">Answer shown in English (spoken answers are always in English for reliability)</p>
                <button onClick={playAnswer} className="mt-3 flex items-center gap-1.5 text-[12px] text-signal-teal hover:underline">
                  {speaking ? <VolumeX size={13} /> : <Volume2 size={13} />}
                  {speaking ? "Stop reading aloud" : "Read answer aloud"}
                </button>
              </div>

              {result.supportingData.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] text-ink-500">
                    <Database size={12} /> {result.source}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {result.supportingData.map((d) => (
                      <div key={d.label} className="rounded-lg bg-ink-800/40 p-2.5 text-center">
                        <div className="text-[10px] text-ink-500">{d.label}</div>
                        <div className="font-mono text-sm font-semibold text-white">{d.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.chartUrl && (
                <div className="mt-4">
                  <img
                    src={result.chartUrl}
                    alt="Generated correlation chart"
                    className="w-full rounded-lg border border-ink-700/60"
                  />
                </div>
              )}

              <div className="pt-4 mt-5 border-t border-ink-700/60">
                {limitReached && (
                  <div className="flex items-center justify-between gap-2 px-4 py-3 mb-4 text-[12px] border rounded-lg border-signal-amber/40 bg-signal-amber/10 text-signal-amber">
                    <div className="flex items-start gap-2">
                      <AlertCircle size={14} className="mt-0.5 shrink-0" />
                      Session limit reached.
                    </div>
                    <span className="font-mono text-sm font-semibold shrink-0">
                      Resets in {formatCountdown(countdownMs)}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-[12px] text-ink-400">{remaining} question{remaining !== 1 ? "s" : ""} remaining</span>
                  <button
                    onClick={handleAskAnother}
                    disabled={limitReached}
                    className="flex items-center gap-1.5 rounded-full bg-signal-teal px-4 py-2 text-[12px] font-medium text-ink-950 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <RotateCcw size={12} /> Ask another
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="mt-4 text-[11px] text-center text-ink-500">
        Regional-language text is machine-translated for this demo and has not been reviewed by a
        native speaker — verify before using in a live presentation.
      </p>
    </div>
  );
}