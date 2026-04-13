import { useState } from 'react';
import { useSessions } from './hooks/useSessions.js';
import { useSettings } from './hooks/useSettings.js';
import { useTimer } from './hooks/useTimer.js';
import { TopBar } from './components/TopBar.js';
import { Sidebar } from './components/Sidebar.js';
import { DetailPanel } from './components/DetailPanel.js';
import { PauseModal } from './components/PauseModal.js';
import { todayStr } from './utils/time.js';

export default function App() {
  const {
    sessions,
    activeSession,
    clockIn,
    clockOut,
    pause,
    resume,
    editTimes,
    deleteSession,
    addManualEntry,
    refresh,
  } = useSessions();

  const { settings, saveRate } = useSettings();
  const elapsed = useTimer(activeSession);

  const [selectedDay, setSelectedDay] = useState(todayStr());
  const [showPauseModal, setShowPauseModal] = useState(false);

  async function handleClockIn() {
    await clockIn();
    setSelectedDay(todayStr());
  }

  async function handleClockOut() {
    if (!activeSession) return;
    await clockOut(activeSession.id);
  }

  async function handlePause() {
    if (!activeSession) return;
    await pause(activeSession.id);
  }

  function handleResumeClick() {
    setShowPauseModal(true);
  }

  async function handleResumeConfirm(comment: string) {
    if (!activeSession) return;
    await resume(activeSession.id, comment || undefined);
    setShowPauseModal(false);
  }

  function handleResumeCancel() {
    setShowPauseModal(false);
  }

  return (
    <div className="app-layout">
      <TopBar
        activeSession={activeSession}
        sessions={sessions}
        elapsed={elapsed}
        hourlyRate={settings.hourly_rate}
        onClockIn={handleClockIn}
        onClockOut={handleClockOut}
        onPause={handlePause}
        onResume={handleResumeClick}
        onRateChange={saveRate}
        onAddManualEntry={addManualEntry}
        onImported={refresh}
      />

      <Sidebar
        sessions={sessions}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        hourlyRate={settings.hourly_rate}
      />

      <DetailPanel
        selectedDay={selectedDay}
        sessions={sessions}
        hourlyRate={settings.hourly_rate}
        activeSession={activeSession}
        elapsed={elapsed}
        onEdit={editTimes}
        onDelete={deleteSession}
      />

      {showPauseModal && (
        <PauseModal
          onConfirm={handleResumeConfirm}
          onCancel={handleResumeCancel}
        />
      )}
    </div>
  );
}
