import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabaseClient'; 
import { Filter } from 'bad-words'; 

const socket = io('https://trivia-api-z36k.onrender.com'); 
const NEWPORT_BAR_ID = '11111111-1111-1111-1111-111111111111';

function App() {
  const [deviceId, setDeviceId] = useState('');
  const [nickname, setNickname] = useState('');
  const [screen, setScreen] = useState<'login' | 'waiting' | 'playing' | 'locked_in' | 'result' | 'final_results'>('login');
  
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

  // NEW: State to hold the live countdown!
  const [timeLeft, setTimeLeft] = useState<number>(10);

  useEffect(() => {
    let savedDeviceId = localStorage.getItem('trivia_device_id');
    if (!savedDeviceId) {
      savedDeviceId = uuidv4();
      localStorage.setItem('trivia_device_id', savedDeviceId);
    }
    setDeviceId(savedDeviceId);

    const setupUser = (user: any) => {
      setCurrentUser(user);
      if (user.user_metadata?.nickname) {
        setNickname(user.user_metadata.nickname);
      } else {
        setNickname(''); 
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setupUser(session.user);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setupUser(session.user);
    });

    socket.on('NEW_QUESTION', (data) => {
      setCurrentQuestion(data);
      setSelectedAnswer(null); 
      setActualCorrectAnswer(null); 
      setQuestionStartTime(Date.now()); 
      setTimeLeft(10); // Reset timer to 10
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

  // NEW: The Live Countdown Effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (screen === 'playing' || screen === 'locked_in') {
      interval = setInterval(() => {
        const elapsedSeconds = Math.floor((Date.now() - questionStartTime) / 1000);
        setTimeLeft(Math.max(0, 10 - elapsedSeconds));
      }, 500); // Check every half second for smoothness
    }
    return () => clearInterval(interval);
  }, [screen, questionStartTime]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setNickname('');
    setAuthMode('guest');
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const filter = new Filter();
    if (nickname && filter.isProfane(nickname)) {
      return setErrorMsg('Keep it clean! Please pick another name.');
    }

    if (currentUser) {
      if (!nickname.trim()) return setErrorMsg('Please enter a nickname.');
      
      if (!currentUser.user_metadata?.nickname) {
        await supabase.auth.updateUser({ data: { nickname: nickname } });
        setCurrentUser({
          ...currentUser,
          user_metadata: { ...currentUser.user_metadata, nickname: nickname }
        });
      }
      
      joinGameLobby();
      return;
    }

    if (authMode === 'guest') {
      if (!nickname.trim()) return setErrorMsg('Please enter a nickname.');
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

  const handleOAuthLogin = async (provider: 'google' | 'apple') => {
    setErrorMsg(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider,
      options: {
        redirectTo: window.location.origin 
      }
    });
    if (error) setErrorMsg(error.message);
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

    socket.emit('SUBMIT_ANSWER', { 
      barId: NEWPORT_BAR_ID, 
      deviceId: deviceId, 
      nickname: nickname, 
      answer: answer,
      userId: currentUser?.id 
    });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center font-sans relative overflow-hidden">
      <div className="w-full max-w-md mx-auto h-full flex flex-col justify-center p-6 relative z-10">
        
        {screen === 'login' && (
          <form onSubmit={handleAuth} className="flex flex-col gap-5 w-full animate-fade-in bg-gray-800 p-8 rounded-3xl shadow-2xl border border-gray-700">
            <h1 className="text-4xl font-black text-center text-blue-500 mb-2">JOIN TRIVIA</h1>
            
            {!currentUser && (
              <div className="flex flex-col gap-3 mb-2">
                <button 
                  type="button" 
                  onClick={() => handleOAuthLogin('google')}
                  className="w-full bg-white text-gray-900 font-bold py-3 rounded-xl flex items-center justify-center gap-3 transition active:scale-95 shadow-md"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Continue with Google
                </button>
                
                <div className="flex items-center gap-2 my-2 opacity-50">
                  <div className="h-px bg-gray-600 flex-1"></div>
                  <span className="text-xs uppercase tracking-widest font-bold">OR</span>
                  <div className="h-px bg-gray-600 flex-1"></div>
                </div>
              </div>
            )}

            {!currentUser && (
              <div className="flex bg-gray-900 rounded-xl p-1 mb-4">
                <button type="button" onClick={() => setAuthMode('guest')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${authMode === 'guest' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>Guest</button>
                <button type="button" onClick={() => setAuthMode('login')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${authMode === 'login' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>Log In</button>
                <button type="button" onClick={() => setAuthMode('signup')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${authMode === 'signup' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>Sign Up</button>
              </div>
            )}

            {errorMsg && <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded-xl text-center font-bold text-sm">{errorMsg}</div>}

            {currentUser ? (
              <div className="text-center py-2">
                <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">👤</div>
                
                {currentUser.user_metadata?.nickname ? (
                  <>
                    <p className="text-gray-400 font-bold mb-2">Welcome back,</p>
                    <p className="text-3xl font-black text-white mb-4">{currentUser.user_metadata.nickname}</p>
                    <button type="button" onClick={handleLogout} className="text-red-400 text-sm font-bold hover:text-red-300 underline transition-colors">
                      Log Out
                    </button>
                  </>
                ) : (
                  <div className="bg-yellow-500/10 border border-yellow-500/50 p-4 rounded-2xl">
                    <p className="text-yellow-400 font-bold mb-2 text-sm uppercase tracking-widest">Account Created!</p>
                    <label className="block text-gray-300 text-xs font-bold mb-2 uppercase">Choose Your Permanent Trivia Name</label>
                    <input 
                      type="text" 
                      value={nickname} 
                      onChange={(e) => setNickname(e.target.value)} 
                      maxLength={12} 
                      className="w-full bg-gray-900 text-white text-2xl font-bold rounded-xl p-3 border-2 border-yellow-600 focus:border-yellow-400 focus:outline-none text-center" 
                      placeholder="e.g. LakersFan99"
                    />
                    <p className="text-xs text-gray-400 mt-3 font-medium">Choose wisely. You cannot change this later!</p>
                  </div>
                )}
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
              {authMode === 'login' && !currentUser ? 'LOG IN & PLAY' : 
               currentUser && !currentUser.user_metadata?.nickname ? 'SAVE & ENTER LOBBY' : 
               currentUser ? 'ENTER LOBBY' : 'PLAY NOW'}
            </button>

            {authMode !== 'guest' && !currentUser && (
               <p className="text-center text-xs text-gray-500 mt-2">Accounts permanently save your lifetime points.</p>
            )}
          </form>
        )}

        {/* --- SCREENS --- */}
        {screen === 'waiting' && (
          <div className="text-center animate-fade-in">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-8"></div>
            <h2 className="text-3xl font-bold mb-2">You're in, {nickname}!</h2>
            <p className="text-xl text-gray-400">Grab a drink.<br/>Game starting soon...</p>
          </div>
        )}

        {screen === 'playing' && currentQuestion && (
          <div className="flex flex-col gap-4 w-full h-full animate-fade-in mt-auto mb-auto">
            {/* NEW: Playing screen countdown timer! */}
            <div className="flex justify-between items-center mb-2 px-2">
               <span className="text-gray-400 font-bold text-sm tracking-widest uppercase">Time Left</span>
               <span className={`font-black text-xl ${timeLeft <= 3 ? 'text-red-400 animate-pulse' : 'text-blue-400'}`}>{timeLeft}s</span>
            </div>
            
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
            
            {/* UPGRADE: The live countdown on the Locked In screen */}
            <p className="mt-12 text-gray-400 font-bold text-lg animate-pulse">
               ⏳ {timeLeft} seconds remaining...
            </p>
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