Security Audit Plan for taptapmath-react-native
1. Executive Summary
The codebase follows standard React Native practices with Supabase as the backend. The primary security risks identified relate to Trusting the Client. Game logic and score state are currently persisted in insecure local storage (AsyncStorage) and the backend rpc likely accepts final scores without sufficient server-side validation of the gameplay session.

2. Identified Vulnerabilities & Risks
🚨 Critical: Insecure Local Storage of Sensitive Game Data
Location:

lib/score-service.ts
 (Uses PENDING_SCORES_KEY)
lib/game-session-store.ts
 (Uses SESSION_KEY)
Issue: AsyncStorage is unencrypted and easily modifiable by users on rooted/jailbroken devices or via debug tools.

Risk: A malicious user can manually edit the PENDING_SCORES_KEY value in AsyncStorage to submit an arbitrarily high score before the app syncs with the backend.
Risk: SESSION_KEY manipulation could allow bypassing game constraints (e.g., lives, timers).
Recommendation:

Short Term: Encrypt this data using expo-secure-store or a library like react-native-encrypted-storage. Note: Client-side keys can still be reverse-engineered, but this raises the difficulty bar.
Long Term (Best Practice): Move to a Server-Authoritative model.
The client should only send "actions" (e.g., "tapped equation X at time T").
The server calculates the score.
OR: Use a "Commit-Reveal" pattern where the game session starts with a signed server timestamp, and the submission includes a replay verification.
⚠️ High: Reliance on Client-Side Score Computation
Location: 
lib/score-service.ts
 -> supabase.rpc('submit_game_score', ...)

Issue: While using an RPC is better than a direct INSERT, if the RPC simply takes userId and score as arguments, it trusts the client completely.

Recommendation:

Rate Limiting: Ensure the RPC has strict rate limits (e.g., one score per 30 seconds).
Sanity Checks: The RPC should validate that the score is theoretically possible within the time elapsed since the last game started.
Replay Protection: The submit_game_score function should require a session_id that was issued by the server at the start of the game.
ℹ️ Info: Supabase Configuration (Row Level Security)
Location: 
.env
 (Public Anon Key)

Issue: The EXPO_PUBLIC_SUPABASE_ANON_KEY is bundled with the app. This is normal design for Supabase, but it is dangerous if Row Level Security (RLS) is not strictly enforced on the database.

Recommendation:

Audit all Supabase tables (profiles, scores, etc.).
Ensure ENABLE RLS is on.
Verify policies:
profiles: Users can only UPDATE their own profile.
scores: Users can only INSERT their own scores (or better, make scores insert-only via the RPC and not directly writable).
✅ Good Practices Found
SecureStore Usage: Auth tokens are stored using ExpoSecureStoreAdapter (in 
lib/supabase.ts
), which is the correct secure way to handle authentication persistence.
Parameterized Queries: Usage of Supabase SDK (.select(), .rpc()) prevents SQL injection by default.
Environment Variables: Configuration is correctly extracted to 
.env
.
3. Remediation Plan (Step-by-Step)
Phase 1: Storage Hardening
Refactor Storage: Replace AsyncStorage usage in 
lib/score-service.ts
 and 
lib/game-session-store.ts
 with SecureStore (or an encrypted wrapper).
Note: SecureStore has size limits (usually ~2KB). If game session data is large, use an encrypted file system approach.
Phase 2: Game Logic Security
Session Tokens:
Create a new RPC start_game_session that returns a signed session_token and a timestamp.
Update submit_game_score to require this session_token.
Server validates: current_time - session_start_time >= expected_game_duration.
Phase 3: Backend Verification
Audit RLS:
Run a rigorous check on the Supabase dashboard to ensure no tables are "Public" writable.
4. Next Steps for Developer
Review this plan.
Authorize the refactoring of 
score-service.ts
 to use encryption.
(If backend access is available) Check Supabase RLS policies immediately.