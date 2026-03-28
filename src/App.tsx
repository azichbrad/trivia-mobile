import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { Trophy, Timer, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

const socket = io('https://trivia-api-z36k.onrender.com');

function App() {
  // 1. THE UPGRADE: Grab the exact room ID from the URL (scanned from the QR code)
  const queryParams = new URLSearchParams(window.location.search);
  const urlBarId = queryParams.get('room');

  const [nickname, setNickname] = useState('');
  const [screen, setScreen] = useState<'login' | 'lobby' | 'countdown' | 'question' | 'leaderboard' | 'final'>('login');
  const [errorMessage, setErrorMessage] = useState('');

  // Game State
  const [countdownData, setCountdownData] = useState<{category: string, time: number} | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [prize, setPrize] = useState('');

  useEffect(() => {
    socket.on('JOIN_SUCCESS', () => setScreen('lobby'));
    socket.on('JOIN_ERROR', (msg) => setErrorMessage(msg));

    // Listen for the hype countdown
    socket.on('ROUND_STARTING', (data) => {
      setCountdownData({ category: data.category, time: data.countdown });
      setScreen('countdown');
    });

    socket.on('NEW_QUESTION', (data) => {
      setCurrentQuestion(data);
      setSelectedAnswer(null); // Reset their selection
      setIsCorrect(null);      // Reset their result
      setScreen('question');
    });

    socket.on('SHOW_LEADERBOARD', (data) => {
      setLeaderboard(data.leaderboard);
      // Determine if they got it right to show them a success/fail message
      if (selectedAnswer) {
        setIsCorrect(selectedAnswer === data.correctAnswer);
      }
      setScreen('leaderboard');
    });

    socket.on('GAME_OVER', (data) => {
      setLeaderboard(data.leaderboard);
      setPrize(data.prize);
      setScreen('final');
    });

    return () => {
      socket.off('JOIN_SUCCESS');
      socket.off('JOIN_ERROR');
      socket.off('ROUND_STARTING');
      socket.off('NEW_QUESTION');
      socket.off('SHOW_LEADERBOARD');
      socket.off('GAME_OVER');
    };
  }, [selectedAnswer]); // Re-run if selectedAnswer changes so the leaderboard logic works

  // Run the countdown clock on the phone
  useEffect(() => {
    if (screen === 'countdown' && countdownData) {
      setTimeLeft(countdownData.time);
      const timer = setInterval(() => setTimeLeft(prev => prev > 0 ? prev - 1 : 0), 1000);
      return () => clearInterval(timer);
    }
  }, [screen, countdownData]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    
    // Safety check: Did they actually scan a QR code?
    if (!urlBarId) {
      setErrorMessage('No room ID found! Please scan the QR code on the TV.');
      return;
    }
    if (!nickname.trim()) return;

    // 2. THE UPGRADE: Join the specific room from the URL
    socket.emit('join_bar', { barId: urlBarId, nickname });
  };

  const handleAnswer = (answer: string) => {
    if (selectedAnswer) return; // Prevent double voting
    setSelectedAnswer(answer);
    socket.emit('SUBMIT_ANSWER', { barId: urlBarId, nickname, answer, userId: null });
  };

  // --- UI SCREENS ---
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans px-6 py-8">
      
      {screen === 'login' && (
        <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full">
          <Trophy className="w-16 h-16 text-indigo-500 mb-6" />
          <h1 className="text-3xl font-black mb-8 tracking-tight text-center">Join the Game</h1>
          
          {errorMessage && (
            <div className="w-full bg-red-500/10 border border-red-500/20 text-red-400 p-4 rounded-xl flex items-start gap-3 mb-6">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">{errorMessage}</p>
            </div>
          )}

          <form onSubmit={handleJoin} className="w-full flex flex-col gap-4">
            <input 
              type="text" 
              maxLength={15}
              value={nickname} 
              onChange={(e) => setNickname(e.target.value)} 
              className="w-full bg-zinc-900 border border-zinc-800 text-white text-center text-xl rounded-2xl px-6 py-4 focus:outline-none focus:border-indigo-500 font-bold" 
              placeholder="Enter Nickname" 
              required
            />
            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xl py-4 rounded-2xl transition-colors">
              Enter Lobby
            </button>
          </form>
        </div>
      )}

      {screen === 'lobby' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center animate-fade-in">
          <div className="w-4 h-4 rounded-full bg-emerald-500 animate-pulse mb-6"></div>
          <h2 className="text-4xl font-black mb-2">You're in, {nickname}!</h2>
          <p className="text-zinc-500 text-xl">Grab a drink. Game starting soon...</p>
        </div>
      )}

      {screen === 'countdown' && (
        <div className="flex-1 flex flex-col items-center justify-center text-center animate-fade-in">
          <Timer className="w-16 h-16 text-indigo-500 mb-6 animate-pulse" />
          <h2 className="text-2xl font-bold text-zinc-400 mb-2">Get Ready!</h2>
          <h3 className="text-3xl font-black text-white mb-8">{countdownData?.category}</h3>
          <div className="text-9xl font-black text-white tabular-nums drop-shadow-[0_0_20px_rgba(99,102,241,0.4)]">
            {timeLeft}
          </div>
        </div>
      )}

      {screen === 'question' && currentQuestion && (
        <div className="flex-1 flex flex-col max-w-md mx-auto w-full animate-fade-in">
          <h2 className="text-2xl font-black text-center mb-8">{currentQuestion.questionText}</h2>
          <div className="flex flex-col gap-4">
            {currentQuestion.answers.map((ans: string, i: number) => {
              const colors = ['bg-red-500', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500'];
              const isSelected = selectedAnswer === ans;
              const hasAnswered = selectedAnswer !== null;
              
              return (
                <button 
                  key={i} 
                  onClick={() => handleAnswer(ans)}
                  disabled={hasAnswered}
                  className={`py-6 rounded-2xl text-xl font-black text-white transition-all
                    ${hasAnswered && !isSelected ? 'opacity-30 scale-95 grayscale' : ''}
                    ${isSelected ? 'ring-4 ring-white scale-105 shadow-2xl' : ''}
                    ${colors[i]}
                  `}
                >
                  {ans}
                </button>
              );
            })}
          </div>
          {selectedAnswer && (
            <p className="text-center mt-8 text-zinc-400 font-bold animate-pulse">Answer locked! Look at the TV...</p>
          )}
        </div>
      )}

      {screen === 'leaderboard' && (
        <div className="flex-1 flex flex-col items-center justify-center animate-fade-in w-full max-w-md mx-auto">
          {isCorrect === true && (
            <div className="flex flex-col items-center text-emerald-400 mb-12">
              <CheckCircle2 className="w-20 h-20 mb-4" />
              <h2 className="text-4xl font-black">CORRECT!</h2>
            </div>
          )}
          {isCorrect === false && (
            <div className="flex flex-col items-center text-red-400 mb-12">
              <XCircle className="w-20 h-20 mb-4" />
              <h2 className="text-4xl font-black">INCORRECT</h2>
            </div>
          )}
          {isCorrect === null && (
            <h2 className="text-2xl font-bold text-zinc-500 mb-12">You didn't answer!</h2>
          )}
          
          <div className="w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-6">
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-indigo-400" /> Top 5
            </h3>
            <div className="flex flex-col gap-3">
              {leaderboard.slice(0, 5).map((player, idx) => (
                <div key={idx} className={`flex justify-between items-center p-4 rounded-xl ${player.name === nickname ? 'bg-indigo-500/20 border border-indigo-500/50' : 'bg-zinc-950'}`}>
                  <span className="font-bold text-lg">#{idx + 1} {player.name}</span>
                  <span className="font-black text-indigo-400">{player.score}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      
      {screen === 'final' && (
        <div className="flex-1 flex flex-col items-center justify-center animate-fade-in w-full max-w-md mx-auto text-center">
          <Trophy className="w-24 h-24 text-amber-400 mb-6" />
          <h2 className="text-5xl font-black text-white mb-2">GAME OVER</h2>
          <p className="text-xl text-zinc-400 mb-12">Check the TV for final standings!</p>
          
          <div className="bg-amber-500/10 border border-amber-500/30 p-6 rounded-2xl w-full">
            <h3 className="text-sm font-bold text-amber-500 uppercase tracking-widest mb-2">Tonight's Prize</h3>
            <p className="text-2xl font-black text-amber-400">{prize}</p>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;