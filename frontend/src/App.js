import { useState } from "react";
import Login from "./Login";
import MainApp from "./MainApp";  // rename your current App.js to MainApp.js

export default function App() {
  const [user, setUser] = useState(null);

  if (!user) return <Login onLogin={setUser} />;
  return <MainApp user={user} />;
}
