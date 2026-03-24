import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabaseClient'; // NEW: Import Supabase!

const socket = io('https://trivia-api-z36k.onrender.com'); // Your live server!
const NEWPORT_BAR_ID = '11111111-1111-1111-1111-111111111111';

function App() {
  const [deviceId, setDeviceId] = useState('');
  const [nickname, setNickname] = useState('');
  const [screen, setScreen] = useState<'login' | 'waiting' | 'playing' | 'locked_in' | 'result' | 'final_results'>('login');
  
  // NEW: Auth States
  const [authMode, setAuthMode] = useState<'guest' | 'signup' | 'login'>('guest');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [currentQuestion, setCurrentQuestion] = useState<any>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null); 
  const [questionStartTime, setQuestionStartTime] = useState<number>(0);
  const [timeTaken, setTimeTaken] = useState<string>('');
  const [potentialPoints, setPotentialPoints] = useState<number>(0);
  const [finalLeaderboard, setFinalLeaderboard] = useState<any[]>([]);
  const [actualCorrectAnswer, setActualCorrectAnswer] = useState<string | null>(null);
  const [reward, setReward] = useState<string>(''); 

  useEffect(() => {
    let savedDeviceId = localStorage.getItem('trivia_device_id');
    if (!savedDeviceId) {
      savedDeviceId = uuidv4();
      localStorage.setItem('trivia_device_id', savedDeviceId);
    }
    setDeviceId(savedDeviceId);

    // NEW: Check if they are already logged in from last week!
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setCurrentUser(session.user);
        setNickname(session.user.user_metadata?.nickname || 'RegularPlayer');
        setAuthMode('guest'); // Bypass the auth form if already logged in
      }
    });

    socket.on('NEW_QUESTION', (data) => {
      setCurrentQuestion(data);
      setSelectedAnswer(null); 
      setActualCorrectAnswer(null); 
      setQuestionStartTime(Date.now()); 
      setScreen('playing');
    });

    socket.on('SHOW_LEADERBOARD', (data) => {
      setActualCorrectAnswer(data.correctAnswer);
      setScreen('result'); 
    });

    socket.on('GAME_OVER', (data) => {
      setFinalLeaderboard(data.leaderboard || []);
      setReward(data.prize || '');
      setScreen('final_results');
      setSelectedAnswer(null); 
    });

    return () => {
      socket.off('NEW_QUESTION');
      socket.off('SHOW_LEADERBOARD');
      socket.off('GAME_OVER');
    };
  }, []);

  // NEW: Handle Account Creation & Login
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (authMode === 'guest') {
      if (!nickname.trim()) return;
      joinGameLobby();
      return;
    }

    if (!email || !password || (authMode === 'signup' && !nickname)) {
      setErrorMsg('Please fill in all fields.');
      return;
    }

    if (authMode === 'signup') {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nickname: nickname } }
      });
      if (error) return setErrorMsg(error.message);
      setCurrentUser(data.user);
      joinGameLobby();
    } 
    
    if (authMode === 'login') {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return setErrorMsg(error.message);
      setCurrentUser(data.user);
      setNickname(data.user?.user_metadata?.nickname || 'Player');
      joinGameLobby();
    }
  };

  const joinGameLobby = () => {
    socket.emit('join_bar', { barId: NEWPORT_BAR_ID, deviceId, nickname });
    socket.once('JOIN_ERROR', (msg) => {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(null), 3000);
    });
    socket.once('JOIN_SUCCESS', () => {
      setScreen('waiting');
      setErrorMsg(null);
    });
  };

  const submitAnswer = (answer: string) => {
    const endTime = Date.now();
    const elapsed = endTime - questionStartTime;
    
    let penalty = Math.floor((elapsed / 10000) * 900);
    if (penalty > 900) penalty = 900; 
    let points = 1000 - penalty;
    if (points < 100) points = 100;

    setTimeTaken((elapsed / 1000).toFixed(1)); 
    setPotentialPoints(points);
    setSelectedAnswer(answer);
    setScreen('locked_in');

    // UPGRADED: We now send the currentUser.id if they have an account!
    socket.emit('SUBMIT_ANSWER', { 
      barId: NEWPORT_BAR_ID, 
      deviceId: deviceId, 
      nickname: nickname, 
      answer: answer,
      userId: currentUser?.id // <--- THIS IS THE MAGIC KEY
    });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center font-sans relative overflow-hidden">
      <div className="w-full max-w-md mx-auto h-full flex flex-col justify-center p-6 relative z-10">
        
        {screen === 'login' && (
          <form onSubmit={handleAuth} className="flex flex-col gap-5 w-full animate-fade-in bg-gray-800 p-8 rounded-3xl shadow-2xl border border-gray-700">
            <h1 className="text-4xl font-black text-center text-blue-500 mb-2">JOIN TRIVIA</h1>
            
            {/* The Auth Tabs */}
            {!currentUser && (
              <div className="flex bg-gray-900 rounded-xl p-1 mb-4">
                <button type="button" onClick={() => setAuthMode('guest')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${authMode === 'guest' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>Guest</button>
                <button type="button" onClick={() => setAuthMode('login')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${authMode === 'login' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>Log In</button>
                <button type="button" onClick={() => setAuthMode('signup')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${authMode === 'signup' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>Sign Up</button>
              </div>
            )}

            {errorMsg && <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-xl text-center font-bold text-sm">{errorMsg}</div>}

            {currentUser ? (
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">👤</div>
                <p className="text-gray-400 font-bold mb-1">Welcome back,</p>
                <p className="text-3xl font-black text-white">{nickname}</p>
              </div>
            ) : (
              <>
                {(authMode === 'guest' || authMode === 'signup') && (
                  <div>
                    <label className="block text-gray-400 text-xs font-bold mb-2 uppercase">Nickname</label>
                    <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={12} className="w-full bg-gray-900 text-white text-xl font-bold rounded-xl p-4 border-2 border-gray-700 focus:border-blue-500 focus:outline-none" placeholder="e.g. LakersFan99"/>
                  </div>
                )}
                {(authMode === 'login' || authMode === 'signup') && (
                  <>
                    <div>
                      <label className="block text-gray-400 text-xs font-bold mb-2 uppercase">Email</label>
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-gray-900 text-white text-xl rounded-xl p-4 border-2 border-gray-700 focus:border-blue-500 focus:outline-none" placeholder="you@email.com"/>
                    </div>
                    <div>
                      <label className="block text-gray-400 text-xs font-bold mb-2 uppercase">Password</label>
                      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full bg-gray-900 text-white text-xl rounded-xl p-4 border-2 border-gray-700 focus:border-blue-500 focus:outline-none" placeholder="••••••••"/>
                    </div>
                  </>
                )}
              </>
            )}

            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black text-2xl py-5 rounded-xl transition active:scale-95 mt-2 shadow-lg shadow-blue-900/50">
              {authMode === 'login' ? 'LOG IN & PLAY' : currentUser ? 'ENTER LOBBY' : 'PLAY NOW'}
            </button>

            {authMode !== 'guest' && !currentUser && (
               <p className="text-center text-xs text-gray-500 mt-2">Accounts permanently save your lifetime points.</p>
            )}
          </form>
        )}

        {/* --- THE REST OF YOUR SCREENS (Waiting, Playing, Locked In, Results) REMAIN EXACTLY THE SAME BELOW THIS LINE --- */}
        {screen === 'waiting' && (
          <div className="text-center animate-fade-in">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-8"></div>
            <h2 className="text-3xl font-bold mb-2">You're in, {nickname}!</h2>
            <p className="text-xl text-gray-400">Grab a drink.<br/>Game starting soon...</p>
          </div>
        )}

        {screen === 'playing' && currentQuestion && (
          <div className="flex flex-col gap-4 w-full h-full animate-fade-in mt-auto mb-auto">
            <h2 className="text-2xl font-bold text-center mb-6">{currentQuestion.questionText}</h2>
            <div className="grid grid-cols-1 gap-4">
              {currentQuestion.answers.map((answer: string, index: number) => {
                const colors = ['bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500'];
                return (
                  <button key={index} onClick={() => submitAnswer(answer)} className={`w-full py-6 rounded-2xl text-2xl font-bold shadow-md transition-all ${colors[index]} active:scale-95`}>{answer}</button>
                );
              })}
            </div>
          </div>
        )}

        {screen === 'locked_in' && (
          <div className="flex flex-col items-center justify-center animate-fade-in text-center h-full">
            <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mb-6 border-4 border-gray-600 shadow-inner">
               <span className="text-4xl">🔒</span>
            </div>
            <h2 className="text-4xl font-black mb-2 text-white">LOCKED IN</h2>
            <p className="text-2xl text-blue-400 font-bold mb-10 px-4">"{selectedAnswer}"</p>
            <div className="bg-gray-800 border border-gray-700 p-6 rounded-3xl w-full max-w-sm flex flex-col gap-6 shadow-2xl">
              <div className="flex justify-between items-center border-b border-gray-700 pb-4">
                <span className="text-gray-400 text-sm uppercase tracking-widest font-bold">Speed</span>
                <span className="text-2xl font-black text-white">{timeTaken}s</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm uppercase tracking-widest font-bold">Potential Points</span>
                <span className="text-3xl font-black text-green-400">+{potentialPoints}</span>
              </div>
            </div>
            <p className="mt-12 text-gray-500 font-medium animate-pulse">Waiting for the timer to finish...</p>
          </div>
        )}

        {screen === 'result' && (
          <div className="flex flex-col items-center justify-center animate-fade-in text-center h-full w-full">
            {selectedAnswer === actualCorrectAnswer ? (
              <>
                <div className="text-7xl mb-6 animate-bounce">✅</div>
                <h2 className="text-5xl font-black mb-4 text-green-400 tracking-tight drop-shadow-lg">CORRECT!</h2>
                <p className="text-2xl text-green-200 font-bold mb-8">+{potentialPoints} Points</p>
              </>
            ) : selectedAnswer ? (
              <>
                <div className="text-7xl mb-6">❌</div>
                <h2 className="text-5xl font-black mb-2 text-red-400 tracking-tight drop-shadow-lg">INCORRECT</h2>
                <p className="text-xl text-red-200 font-bold mb-8">0 Points Awarded</p>
                <div className="bg-gray-800 border border-gray-700 p-5 rounded-2xl mb-8 w-full max-w-sm shadow-xl">
                   <p className="text-sm text-gray-400 uppercase tracking-widest mb-2 font-bold">Correct Answer</p>
                   <p className="text-2xl font-bold text-white">{actualCorrectAnswer}</p>
                </div>
              </>
            ) : (
              <>
                <div className="text-7xl mb-6">⏳</div>
                <h2 className="text-4xl font-black mb-4 text-gray-400 tracking-tight">TOO LATE!</h2>
                <p className="text-xl text-gray-300 font-bold mb-8">0 Points Awarded</p>
                <div className="bg-gray-800 border border-gray-700 p-5 rounded-2xl mb-8 w-full max-w-sm shadow-xl">
                   <p className="text-sm text-gray-400 uppercase tracking-widest mb-2 font-bold">Correct Answer</p>
                   <p className="text-2xl font-bold text-white">{actualCorrectAnswer}</p>
                </div>
              </>
            )}
            <div className="mt-4 px-6 py-3 bg-gray-800/80 rounded-full border border-gray-600 shadow-lg">
              <p className="text-lg text-blue-300 font-bold">Eyes on the TV for the Top 5...</p>
            </div>
          </div>
        )}

        {screen === 'final_results' && (
          <div className="flex flex-col items-center justify-center animate-fade-in text-center h-full w-full">
            <h2 className="text-5xl font-black mb-6 text-yellow-400 tracking-tight">FINAL SCORES</h2>
            {finalLeaderboard.length > 0 && finalLeaderboard[0].name === nickname && (
              <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 p-1 rounded-2xl w-full max-w-sm mb-6 shadow-2xl animate-bounce">
                <div className="bg-gray-900 p-4 rounded-xl border border-yellow-500/50">
                  <p className="text-yellow-400 font-bold text-sm tracking-widest uppercase mb-1">🥇 You Won!</p>
                  <p className="text-white font-black text-2xl">Show Bartender for:</p>
                  <p className="text-yellow-400 font-black text-3xl mt-2">{reward}</p>
                </div>
              </div>
            )}
            <div className="bg-gray-800 border border-gray-700 p-6 rounded-3xl w-full max-w-sm flex flex-col gap-4 shadow-2xl mb-8">
              {finalLeaderboard.length === 0 ? (
                <p className="text-gray-400 text-xl font-bold py-4">Nobody scored points!</p>
              ) : (
                finalLeaderboard.map((player, idx) => (
                  <div key={idx} className={`flex justify-between items-center p-4 rounded-xl ${player.name === nickname ? 'bg-blue-600 border-2 border-blue-400 shadow-lg scale-105' : 'bg-gray-900 border border-gray-700'}`}>
                    <div className="flex items-center gap-4">
                      <span className="text-2xl font-black text-gray-500">#{idx + 1}</span>
                      <span className="text-xl font-bold text-white">{player.name}</span>
                    </div>
                    <span className="text-2xl font-black text-green-400">{player.score.toLocaleString()}</span>
                  </div>
                ))
              )}
            </div>
            <button onClick={() => setScreen('waiting')} className="bg-gray-700 hover:bg-gray-600 text-white text-xl font-bold py-4 px-8 rounded-xl transition-all shadow-lg active:scale-95 w-full max-w-sm">Back to Lobby</button>
          </div>
        )}

      </div>
      {screen === 'result' && selectedAnswer === actualCorrectAnswer && <div className="absolute inset-0 bg-green-900/40 z-0 transition-opacity duration-500"></div>}
      {screen === 'result' && selectedAnswer !== actualCorrectAnswer && selectedAnswer !== null && <div className="absolute inset-0 bg-red-900/40 z-0 transition-opacity duration-500"></div>}
    </div>
  );
}

export default App;