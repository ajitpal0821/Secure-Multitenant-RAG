
import { useEffect, useState, type FormEvent } from "react";
import "./App.css";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:4000";

type Role = "admin" | "manager" | "employee";

interface User {
  id: string;
  tenantId: string;
  email: string;
  role: Role;
}

interface Document {
  id: string;
  title: string;
  tenant_id: string;
  min_role: string;
  tenant_name: string;
  created_at: string;
}

interface Source {
  document: string;
  tenant: string;
  distance: number;
}

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
}

type Tab = "documents" | "chat";

function App() {
  const [token, setToken] = useState(
    localStorage.getItem("rag_token") || ""
  );

  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("rag_user");
    return saved ? JSON.parse(saved) : null;
  });

  const [mode, setMode] = useState("loading");
  const [activeTab, setActiveTab] = useState<Tab>("chat");

  const [email, setEmail] = useState(
    "admin.a@company-a.local"
  );

  const [password, setPassword] = useState("Password123!");

  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentTitle, setDocumentTitle] = useState("");
  const [minRole, setMinRole] = useState<Role>("employee");

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // =====================================
  // API REQUEST HELPER
  // =====================================

  async function apiRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(token
          ? { Authorization: `Bearer ${token}` }
          : {}),
        ...options.headers
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Request failed");
    }

    return data as T;
  }

  // =====================================
  // CHECK BACKEND MODE
  // =====================================

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((response) => response.json())
      .then((data) => {
        setMode(data.securityMode || "unknown");
      })
      .catch(() => {
        setMode("offline");
      });
  }, []);

  // =====================================
  // LOAD DOCUMENTS
  // =====================================

  async function loadDocuments() {
    try {
      const data = await apiRequest<{
        documents: Document[];
      }>("/api/documents");

      setDocuments(data.documents);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load documents"
      );
    }
  }

  useEffect(() => {
    if (token) {
      loadDocuments();
    }
  }, [token]);

  // =====================================
  // LOGIN
  // =====================================

  async function handleLogin(event: FormEvent) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const data = await apiRequest<{
        token: string;
        user: User;
      }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });

      localStorage.setItem("rag_token", data.token);
      localStorage.setItem(
        "rag_user",
        JSON.stringify(data.user)
      );

      setToken(data.token);
      setUser(data.user);
      setSuccess("Login successful");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Login failed"
      );
    } finally {
      setLoading(false);
    }
  }

  // =====================================
  // LOGOUT
  // =====================================

  function handleLogout() {
    localStorage.removeItem("rag_token");
    localStorage.removeItem("rag_user");

    setToken("");
    setUser(null);
    setDocuments([]);
    setMessages([]);
    setSuccess("");
    setError("");
  }

  // =====================================
  // DOCUMENT UPLOAD
  // =====================================

  async function handleUpload(event: FormEvent) {
    event.preventDefault();

    if (!selectedFile) {
      setError("Please select a document");
      return;
    }

    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const formData = new FormData();

      formData.append("file", selectedFile);

      if (documentTitle.trim()) {
        formData.append("title", documentTitle);
      }

      formData.append("minRole", minRole);

      const data = await apiRequest<{
        message: string;
        chunksCreated: number;
      }>("/api/documents/upload", {
        method: "POST",
        body: formData
      });

      setSuccess(
        `${data.message}. ${data.chunksCreated} chunks created.`
      );

      setSelectedFile(null);
      setDocumentTitle("");

      await loadDocuments();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Upload failed"
      );
    } finally {
      setLoading(false);
    }
  }

  // =====================================
  // RAG CHAT
  // =====================================

  async function handleChat(event: FormEvent) {
    event.preventDefault();

    const userQuestion = question.trim();

    if (!userQuestion) return;

    setError("");
    setQuestion("");

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: userQuestion
    };

    setMessages((previous) => [
      ...previous,
      userMessage
    ]);

    setLoading(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, 15000);

    try {
      const data = await apiRequest<{
        answer: string;
        sources: Source[];
        retrievedChunks: number;
      }>("/api/chat", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          question: userQuestion
        })
      });

      const assistantMessage: ChatMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: data.answer,
        sources: data.sources
      };

      setMessages((previous) => [
        ...previous,
        assistantMessage
      ]);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Stopped: AI did not respond in time.");
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Chat request failed"
        );
      }
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  // =====================================
  // LOGIN SCREEN
  // =====================================

  if (!token || !user) {
    return (
      <main className="login-page">
        <section className="login-card">
          <div className="brand-icon">R</div>

          <p className="eyebrow">AI SECURITY LAB</p>

          <h1>Secure RAG</h1>

          <p className="muted">
            Multi-tenant knowledge intelligence platform.
          </p>

          <div className={`mode-badge ${mode}`}>
            <span className="status-dot" />
            {mode === "loading"
              ? "Checking backend..."
              : `Mode: ${mode}`}
          </div>

          {error && (
            <div className="alert error">{error}</div>
          )}

          <form onSubmit={handleLogin}>
            <label>Email address</label>

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@company.com"
              required
            />

            <label>Password</label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <button
              className="primary-button full-width"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="demo-info">
            <strong>Local demo credentials</strong>
            <p>admin.a@company-a.local</p>
            <p>Password123!</p>
          </div>
        </section>
      </main>
    );
  }

  // =====================================
  // MAIN APPLICATION
  // =====================================

  return (
    <div className="app-layout">

      {/* SIDEBAR */}

      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon small">R</div>

          <div>
            <strong>Secure RAG</strong>
            <span>Security Research Lab</span>
          </div>
        </div>

        <div className="sidebar-section">
          <span className="sidebar-label">WORKSPACE</span>

          <button
            className={`nav-item ${activeTab === "chat" ? "active" : ""
              }`}
            onClick={() => setActiveTab("chat")}
          >
            <span>◉</span>
            AI Chat
          </button>

          <button
            className={`nav-item ${activeTab === "documents" ? "active" : ""
              }`}
            onClick={() => setActiveTab("documents")}
          >
            <span>▤</span>
            Documents
          </button>
        </div>

        <div className="sidebar-bottom">
          <div className="user-card">
            <div className="avatar">
              {user.email[0].toUpperCase()}
            </div>

            <div className="user-details">
              <strong>{user.email}</strong>
              <span>{user.role} · {user.tenantId.slice(0, 8)}</span>
            </div>
          </div>

          <button
            className="logout-button"
            onClick={handleLogout}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}

      <main className="main-content">

        <header className="topbar">
          <div>
            <span className="eyebrow">WORKSPACE</span>
            <h2>
              {activeTab === "chat"
                ? "AI Knowledge Assistant"
                : "Document Management"}
            </h2>
          </div>

          <div className={`mode-badge ${mode}`}>
            <span className="status-dot" />
            {mode.toUpperCase()}
          </div>
        </header>

        <div className="content-area">

          {error && (
            <div className="alert error">
              {error}
              <button onClick={() => setError("")}>×</button>
            </div>
          )}

          {success && (
            <div className="alert success">
              {success}
              <button onClick={() => setSuccess("")}>×</button>
            </div>
          )}

          {/* DOCUMENTS PAGE */}

          {activeTab === "documents" && (
            <section className="page-section">

              <div className="section-heading">
                <div>
                  <h3>Your knowledge base</h3>
                  <p className="muted">
                    Upload documents to make them searchable using AI.
                  </p>
                </div>

                <span className="count-badge">
                  {documents.length} documents
                </span>
              </div>

              <form
                className="upload-card"
                onSubmit={handleUpload}
              >
                <h3>Upload a document</h3>

                <label>Document title (optional)</label>

                <input
                  value={documentTitle}
                  onChange={(e) =>
                    setDocumentTitle(e.target.value)
                  }
                  placeholder="Enter document title"
                />

                <label>Minimum role</label>

                <select
                  value={minRole}
                  onChange={(e) =>
                    setMinRole(e.target.value as Role)
                  }
                >
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>

                <label className="file-picker">
                  <span>↑</span>
                  <strong>
                    {selectedFile
                      ? selectedFile.name
                      : "Choose a TXT or PDF file"}
                  </strong>
                  <small>Click to browse your files</small>

                  <input
                    type="file"
                    accept=".txt,.pdf,text/plain,application/pdf"
                    onChange={(e) =>
                      setSelectedFile(
                        e.target.files?.[0] || null
                      )
                    }
                  />
                </label>

                <button
                  className="primary-button"
                  disabled={loading || !selectedFile}
                >
                  {loading
                    ? "Processing document..."
                    : "Upload and process"}
                </button>
              </form>

              <div className="documents-card">
                <h3>Uploaded documents</h3>

                {documents.length === 0 ? (
                  <p className="muted">
                    No documents uploaded yet.
                  </p>
                ) : (
                  <div className="document-list">
                    {documents.map((doc) => (
                      <div
                        className="document-row"
                        key={doc.id}
                      >
                        <div className="document-icon">
                          ▤
                        </div>

                        <div className="document-details">
                          <strong>{doc.title}</strong>
                          <span>
                            {doc.tenant_name} · Minimum role:{" "}
                            {doc.min_role}
                          </span>
                        </div>

                        <span className="document-date">
                          {new Date(
                            doc.created_at
                          ).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </section>
          )}

          {/* CHAT PAGE */}

          {activeTab === "chat" && (
            <section className="chat-section">

              <div className="chat-intro">
                <div className="chat-icon">✳</div>
                <h3>Ask your knowledge base</h3>
                <p className="muted">
                  Ask questions about your uploaded documents.
                  Responses are generated using retrieved context.
                </p>
              </div>

              <div className="messages">
                {messages.length === 0 && (
                  <div className="empty-chat">
                    <p>Start a conversation</p>
                    <span>
                      Example: What is the approved budget
                      for Project ORION?
                    </span>
                  </div>
                )}

                {messages.map((message) => (
                  <article
                    className={`message ${message.role}`}
                    key={message.id}
                  >
                    <div className="message-role">
                      {message.role === "user"
                        ? "You"
                        : "AI Assistant"}
                    </div>

                    <div className="message-content">
                      {message.content}
                    </div>

                    {message.sources &&
                      message.sources.length > 0 && (
                        <div className="sources">
                          <strong>
                            Retrieved sources ({message.sources.length})
                          </strong>

                          {message.sources.map((source, index) => (
                            <div
                              className="source-item"
                              key={index}
                            >
                              <span>
                                {source.document}
                              </span>
                              <small>
                                {source.tenant} · Distance:{" "}
                                {source.distance.toFixed(4)}
                              </small>
                            </div>
                          ))}
                        </div>
                      )}
                  </article>
                ))}

                {loading && (
                  <div className="thinking">
                    AI is processing your question...
                  </div>
                )}
              </div>

              <form
                className="chat-input-area"
                onSubmit={handleChat}
              >
                <input
                  value={question}
                  onChange={(e) =>
                    setQuestion(e.target.value)
                  }
                  placeholder="Ask anything about your documents..."
                  disabled={loading}
                />

                <button
                  className="primary-button"
                  disabled={loading || !question.trim()}
                >
                  Send ↑
                </button>
              </form>

              <p className="chat-disclaimer">
                AI-generated responses may be inaccurate.
                Retrieved documents are displayed for reference.
              </p>

            </section>
          )}

        </div>
      </main>
    </div>
  );
}

export default App;
