import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import "./feature-requests.css";
import type {
  FeatureRequestRow,
  FeatureRequestVoteRow,
  SubmitterType,
} from "./types";

type Props = {
  supabase: SupabaseClient;
  source: "waitlist" | "app";
  currentUserId?: string | null;
  backTo?: string;
};

const tabs: Array<{ id: "all" | SubmitterType; label: string }> = [
  { id: "all", label: "All" },
  { id: "verified", label: "Verified users" },
  { id: "unverified", label: "Unverified users" },
];

export function FeatureRequestsPage({
  supabase,
  source,
  currentUserId = null,
  backTo = "/",
}: Props) {
  const submitterType: SubmitterType = currentUserId ? "verified" : "unverified";
  const isVerifiedSession = !!currentUserId;
  const [activeTab, setActiveTab] = useState<"all" | SubmitterType>(submitterType);
  const [requests, setRequests] = useState<FeatureRequestRow[]>([]);
  const [voteMap, setVoteMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);

  const [content, setContent] = useState("");
  const [email, setEmail] = useState("");
  const [voterEmailInput, setVoterEmailInput] = useState("");
  const [sessionVoterEmail, setSessionVoterEmail] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const value = window.sessionStorage.getItem("echoo_feature_voter_email");
      return value && value.trim().length > 0 ? value : null;
    } catch {
      return null;
    }
  });

  const getVoterToken = useCallback(() => {
    const storageKey = "echoo_feature_voter_token";
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;

    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(storageKey, token);
    return token;
  }, []);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("feature_requests")
      .select("id, content, vote_score, created_at, submitter_type")
      .eq("status", "open")
      .order("vote_score", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50);

    if (activeTab !== "all") {
      query = query.eq("submitter_type", activeTab);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Error loading feature requests:", error);
      setMessage(`Could not load requests: ${error.message}`);
      setLoading(false);
      return;
    }

    const rows = (data ?? []) as FeatureRequestRow[];
    setRequests(rows);

    const ids = rows.map((row) => row.id);
    if (ids.length === 0) {
      setVoteMap({});
      setLoading(false);
      return;
    }

    let voteQuery = supabase
      .from("feature_request_votes")
      .select("id, feature_request_id, vote")
      .in("feature_request_id", ids);

    if (isVerifiedSession) {
      voteQuery = voteQuery.eq("created_by", currentUserId);
    } else if (sessionVoterEmail) {
      voteQuery = voteQuery.eq("contact_email", sessionVoterEmail);
    } else {
      setVoteMap({});
      setLoading(false);
      return;
    }

    const { data: votes, error: votesError } = await voteQuery;

    if (votesError) {
      console.error("Error loading votes:", votesError);
      setMessage(`Could not load your votes: ${votesError.message}`);
      setLoading(false);
      return;
    }

    const nextMap: Record<string, number> = {};
    for (const row of (votes ?? []) as FeatureRequestVoteRow[]) {
      nextMap[row.feature_request_id] = row.vote;
    }
    setVoteMap(nextMap);
    setLoading(false);
  }, [
    activeTab,
    currentUserId,
    getVoterToken,
    isVerifiedSession,
    sessionVoterEmail,
    supabase,
  ]);

  const refreshSingleRequestLazy = useCallback(
    (id: string) => {
      const run = async () => {
        const { data, error } = await supabase
          .from("feature_requests")
          .select("id, vote_score")
          .eq("id", id)
          .maybeSingle();
        if (error || !data) return;

        setRequests((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, vote_score: data.vote_score } : item,
          ),
        );
      };

      // Lazy sync during browser idle time; falls back to a short timeout.
      if ("requestIdleCallback" in window) {
        (
          window as typeof window & {
            requestIdleCallback: (
              callback: IdleRequestCallback,
              options?: IdleRequestOptions,
            ) => number;
          }
        ).requestIdleCallback(() => {
          run().catch(() => undefined);
        });
      } else {
        globalThis.setTimeout(() => {
          run().catch(() => undefined);
        }, 200);
      }
    },
    [supabase],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadRequests().catch((err) => console.error(err));
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [loadRequests]);

  const shownRequests = useMemo(() => requests, [requests]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!content.trim()) return;
    if (submitterType === "unverified" && !email.trim()) {
      setMessage("Email is required for unverified requests.");
      return;
    }

    setSending(true);
    setMessage("");

    const { error } = await supabase.from("feature_requests").insert([
      {
        content: content.trim(),
        source,
        status: "open",
        submitter_type: submitterType,
        contact_email: submitterType === "unverified" ? email.trim() : null,
        created_by: submitterType === "verified" ? currentUserId : null,
      },
    ]);

    if (error) {
      console.error("Error creating feature request:", error);
      setMessage("Could not submit right now. Please try again.");
      setSending(false);
      return;
    }

    setContent("");
    if (submitterType === "unverified") setEmail("");
    setMessage("Thanks. Your request is now in the dashboard.");
    await loadRequests();
    setSending(false);
  };

  const onVote = async (id: string, vote: 1 | -1) => {
    if (!isVerifiedSession && !sessionVoterEmail) {
      setMessage("To vote, enter your waitlist email once for this session.");
      return;
    }

    setVotingId(id);
    setMessage("");
    const token = getVoterToken();
    const currentVote = voteMap[id] ?? 0;
    const nextVote = currentVote === vote ? 0 : vote;
    const scoreDelta = nextVote - currentVote;
    const previousVoteMap = voteMap;
    const previousRequests = requests;

    // Optimistic state update: instant UI response without full refetch.
    setVoteMap((prev) => {
      if (nextVote === 0) {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: nextVote };
    });
    setRequests((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, vote_score: item.vote_score + scoreDelta } : item,
      ),
    );

    if (nextVote === 0) {
      const { error } = await supabase
        .from("feature_request_votes")
        .delete()
        .eq("feature_request_id", id)
        .eq("voter_token", token);
      if (error) {
        console.error("Error deleting vote:", error);
        setMessage(`Voting failed: ${error.message}`);
        setVoteMap(previousVoteMap);
        setRequests(previousRequests);
        setVotingId(null);
        return;
      }
    } else {
      const { error } = await supabase.from("feature_request_votes").upsert(
        [
          {
            feature_request_id: id,
            voter_token: token,
            vote: nextVote,
            created_by: isVerifiedSession ? currentUserId : null,
            contact_email: isVerifiedSession ? null : sessionVoterEmail,
          },
        ],
        { onConflict: "feature_request_id,voter_token" },
      );
      if (error) {
        console.error("Error upserting vote:", error);
        setMessage(`Voting failed: ${error.message}`);
        setVoteMap(previousVoteMap);
        setRequests(previousRequests);
        setVotingId(null);
        return;
      }
    }

    refreshSingleRequestLazy(id);
    setVotingId(null);
  };

  return (
    <div className="fr-page">
      <div className="fr-header">
        <Link to={backTo} className="fr-back">
          ← Back
        </Link>
        <h2>Feature requests</h2>
      </div>

      <div className="fr-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "fr-tab active" : "fr-tab"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <form className="fr-form" onSubmit={onSubmit}>
        <p className="fr-mode-info">
          {submitterType === "verified"
            ? "Mode: Verified user. Requests are submitted as your authenticated app account."
            : "Mode: Unverified user. Requests are submitted without app account and require your email."}
        </p>
        {!isVerifiedSession && (
          <div className="fr-voter-gate">
            <input
              type="email"
              placeholder="Waitlist email for voting"
              value={voterEmailInput}
              onChange={(e) => setVoterEmailInput(e.target.value)}
            />
            <button
              type="button"
              onClick={() => {
                const normalized = voterEmailInput.trim().toLowerCase();
                if (!normalized) {
                  setMessage("Enter your waitlist email to enable voting.");
                  return;
                }
                setSessionVoterEmail(normalized);
                try {
                  window.sessionStorage.setItem(
                    "echoo_feature_voter_email",
                    normalized,
                  );
                } catch {
                  // ignore session storage errors
                }
                setMessage("Voting enabled for this session.");
              }}
            >
              Save voting email
            </button>
          </div>
        )}
        <textarea
          placeholder="What should Echoo add next?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          minLength={8}
          maxLength={500}
          required
        />
        <div className="fr-form-row">
          <div className="fr-user-type" aria-label="Submitter type">
            {submitterType === "verified"
              ? "Verified user (signed-in app account)"
              : "Unverified user (no app account)"}
          </div>
          {submitterType === "unverified" && (
            <input
              type="email"
              placeholder="Your email (required)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          )}
        </div>
        <button type="submit" disabled={sending}>
          {sending ? "Sending..." : "Submit feature request"}
        </button>
        {message && <p className="fr-message">{message}</p>}
      </form>

      <div className="fr-list">
        {loading ? (
          <p className="fr-empty">Loading...</p>
        ) : shownRequests.length === 0 ? (
          <p className="fr-empty">No requests yet in this category.</p>
        ) : (
          shownRequests.map((item) => {
            const ownVote = voteMap[item.id] ?? 0;
            return (
              <article key={item.id} className="fr-item">
                <div className="fr-item-main">
                  <p>{item.content}</p>
                  <span className="fr-badge">{item.submitter_type}</span>
                </div>
                <div className="fr-votes">
                  <button
                    type="button"
                    onClick={() => onVote(item.id, 1)}
                    className={ownVote === 1 ? "active" : ""}
                    aria-label="Upvote request"
                    disabled={votingId === item.id}
                  >
                    ▲
                  </button>
                  <span>{item.vote_score}</span>
                  <button
                    type="button"
                    onClick={() => onVote(item.id, -1)}
                    className={ownVote === -1 ? "active" : ""}
                    aria-label="Downvote request"
                    disabled={votingId === item.id}
                  >
                    ▼
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
