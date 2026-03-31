import { useState } from "react";

export default function Login({ onLogin }) {
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [success,  setSuccess]  = useState(false);
  const [errors,   setErrors]   = useState({});

  const validate = () => {
    const e = {};
    if (!email || !email.includes("@")) e.email = "Enter a valid email";
    if (!password || password.length < 6) e.pass = "Password must be 6+ characters";
    return e;
  };

  const handleLogin = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setLoading(true); setErrors({});
    await new Promise(r => setTimeout(r, 1200)); // replace with real API call
    setLoading(false); setSuccess(true);
    setTimeout(() => onLogin && onLogin({ email }), 800);
  };

  const styles = {
    wrap:    { minHeight:"100vh", background:"#020617", display:"flex", alignItems:"center", justifyContent:"center", padding:24 },
    card:    { background:"#0f172a", borderRadius:20, padding:"2.5rem 2rem", width:"100%", maxWidth:400,
                border:"1px solid rgba(30,64,175,0.5)", animation:"slideUp 0.5s ease" },
    logoBox: { width:44, height:44, borderRadius:12, background:"linear-gradient(135deg,#22c55e,#065f46)",
                display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, fontWeight:700, color:"#fff" },
    label:   { fontSize:12, color:"#64748b", marginBottom:6, display:"block" },
    input:   { width:"100%", padding:"10px 14px", borderRadius:10, border:"1px solid rgba(51,65,85,0.8)",
                background:"#020617", color:"#e5e7eb", fontSize:14, outline:"none" },
    btn:     { width:"100%", padding:12, borderRadius:10, border:"none",
                background: loading||success ? "#166534" : "linear-gradient(135deg,#22c55e,#16a34a)",
                color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer", marginTop:8 },
    ghost:   { width:"100%", padding:11, borderRadius:10, border:"1px solid rgba(51,65,85,0.8)",
                background:"transparent", color:"#e5e7eb", fontSize:14, cursor:"pointer",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8 },
    err:     { fontSize:11, color:"#ef4444", marginTop:4 },
    badge:   { display:"inline-block", background:"rgba(34,197,94,0.15)", color:"#22c55e",
                fontSize:11, padding:"3px 10px", borderRadius:999, marginBottom:12 },
    divider: { display:"flex", alignItems:"center", gap:12, margin:"1.25rem 0",
                color:"#64748b", fontSize:12 },
  };

  return (
    <div style={styles.wrap}>
      <style>{`@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}`}</style>
      <div style={styles.card}>

        {/* Logo */}
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:24, justifyContent:"center" }}>
          <div style={styles.logoBox}>S</div>
          <div>
            <div style={{ fontSize:20, fontWeight:700, color:"#f9fafb" }}>StockScope</div>
            <div style={{ fontSize:11, color:"#64748b" }}>Investor Research Workspace</div>
          </div>
        </div>

        {/* Badge + heading */}
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={styles.badge}>✓ Free · No ads · NSE/BSE data</div>
          <div style={{ fontSize:20, fontWeight:700, color:"#f9fafb", marginBottom:4 }}>Welcome back</div>
          <div style={{ fontSize:13, color:"#64748b" }}>Sign in to your research workspace</div>
        </div>

        {success ? (
          <div style={{ textAlign:"center", padding:"1.5rem 0" }}>
            <div style={{ width:60, height:60, borderRadius:"50%", background:"rgba(34,197,94,0.15)",
              display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 1rem", fontSize:28 }}>✓</div>
            <div style={{ fontSize:16, fontWeight:600, color:"#22c55e" }}>Signed in!</div>
            <div style={{ fontSize:13, color:"#64748b", marginTop:4 }}>Redirecting to dashboard...</div>
          </div>
        ) : (
          <>
            {/* Email */}
            <div style={{ marginBottom:14 }}>
              <label style={styles.label}>Email</label>
              <input style={{ ...styles.input, borderColor: errors.email ? "#ef4444" : "rgba(51,65,85,0.8)" }}
                type="email" placeholder="you@example.com"
                value={email} onChange={e => setEmail(e.target.value)} />
              {errors.email && <div style={styles.err}>{errors.email}</div>}
            </div>

            {/* Password */}
            <div style={{ marginBottom:8 }}>
              <label style={styles.label}>Password</label>
              <input style={{ ...styles.input, borderColor: errors.pass ? "#ef4444" : "rgba(51,65,85,0.8)" }}
                type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key==="Enter" && handleLogin()} />
              {errors.pass && <div style={styles.err}>{errors.pass}</div>}
            </div>

            <div style={{ textAlign:"right", marginBottom:16 }}>
              <span style={{ fontSize:12, color:"#22c55e", cursor:"pointer" }}>Forgot password?</span>
            </div>

            <button style={styles.btn} onClick={handleLogin} disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>

            <div style={styles.divider}>
              <div style={{ flex:1, height:1, background:"rgba(51,65,85,0.6)" }}/>
              or
              <div style={{ flex:1, height:1, background:"rgba(51,65,85,0.6)" }}/>
            </div>

            <button style={styles.ghost}>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <div style={{ textAlign:"center", marginTop:20, fontSize:12, color:"#64748b" }}>
              No account?{" "}
              <span style={{ color:"#22c55e", cursor:"pointer" }}>Create one free</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
