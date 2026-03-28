'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCcw, ArrowRight, Loader2, Code2 } from 'lucide-react';

export default function Landing() {
  const router = useRouter();
  const [siteId, setSiteId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'exists' | 'new', text: string } | null>(null);

  const generateRandomId = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const length = Math.floor(Math.random() * 5) + 6; // 6 to 10 chars
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setSiteId(result);
    setError('');
    setStatusMessage(null);
  };

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteId.trim()) {
      setError('Please enter a Site ID');
      return;
    }
    
    // Validate length 1-64
    if (siteId.length > 64) {
      setError('Site ID must be 64 characters or less');
      return;
    }

    // Only alphanumeric and hyphens/underscores to be safe for URLs
    if (!/^[a-zA-Z0-9_-]+$/.test(siteId)) {
        setError('Only alphanumeric characters, hyphens, and underscores are allowed.');
        return;
    }

    setIsLoading(true);
    setError('');
    setStatusMessage(null);

    try {
      const response = await fetch(`/api/snippets/check?id=${encodeURIComponent(siteId)}`);
      if (!response.ok) {
        throw new Error('Failed to check existence');
      }
      
      const data = await response.json();
      if (data.exists) {
        setStatusMessage({
          type: 'exists',
          text: `Site '${siteId}' already exists. Would you like to go there?`
        });
      } else {
        setStatusMessage({
          type: 'new',
          text: `Site '${siteId}' is available! Creating...`
        });
        await handleCreate();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const files = [{ id: Date.now().toString(), name: 'main.txt', content: '' }];
      const createResponse = await fetch('/api/snippets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortId: siteId, files })
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create site');
      }

      router.push(`/${siteId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while creating');
    }
  };

  const handleGoToExisting = () => {
    router.push(`/${siteId}`);
  };

  return (
    <div className="landing-container">
      <div className="landing-content animate-fade-in">
        <div className="landing-logo">
          <div className="brand-mark-large"><Code2 size={32} /></div>
          <h1>Welcome to Teter</h1>
          <p>Create & share code snippets instantly with a custom URL.</p>
        </div>

        <div className="landing-card border-glow">
          <form onSubmit={handleCheck} className="landing-form">
            <label htmlFor="siteId" className="form-label">Create or Join a Site</label>
            <div className="input-group">
              <span className="url-prefix">teter.app/</span>
              <input
                id="siteId"
                type="text"
                className="site-input"
                placeholder="my-awesome-site"
                value={siteId}
                onChange={(e) => {
                  setSiteId(e.target.value);
                  setError('');
                  setStatusMessage(null);
                }}
                maxLength={64}
                autoComplete="off"
                spellCheck={false}
              />
              <button 
                type="button" 
                className="btn btn-icon random-btn" 
                onClick={generateRandomId}
                title="Generate Random ID"
              >
                <RefreshCcw size={16} />
              </button>
            </div>
            
            {error && <div className="error-message">{error}</div>}
            
            {statusMessage && (
              <div className={`status-message ${statusMessage.type === 'exists' ? 'status-exists' : 'status-new'}`}>
                {statusMessage.text}
                {statusMessage.type === 'exists' && (
                  <button type="button" className="btn btn-primary mt-3 w-full" onClick={handleGoToExisting}>
                    Yes, take me there <ArrowRight size={16} />
                  </button>
                )}
              </div>
            )}

            {!statusMessage && (
              <button 
                type="submit" 
                className="btn btn-primary submit-btn mt-3" 
                disabled={isLoading || !siteId.trim()}
              >
                {isLoading ? <Loader2 className="animate-spin" size={16} /> : 'Check & Create'}
                {!isLoading && <ArrowRight size={16} />}
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
