import { CheckCircle2, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { submitPostForm } from '../services/firestoreService';
import type { Post } from '../types';

interface FormFillModalProps {
  post: Post | null;
  onClose: () => void;
  onSubmitted: (message: string) => void;
}

export function FormFillModal({ post, onClose, onSubmitted }: FormFillModalProps) {
  const { user, profile, signInWithGoogle, authBusy } = useAuth();
  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!post) return;
    const defaults: Record<string, string | boolean> = {};
    post.formConfig.fields.forEach((field) => {
      if (field.type === 'checkbox') {
        defaults[field.id] = false;
      } else if (field.type === 'select' && field.options.length > 0) {
        defaults[field.id] = field.options[0];
      } else {
        defaults[field.id] = '';
      }
    });
    setAnswers(defaults);
    setErrorMsg(null);
    setDone(false);
  }, [post]);

  if (!post) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!post.formConfig.isOpen) {
      setErrorMsg('This form is currently closed by the creator.');
      return;
    }

    for (const field of post.formConfig.fields) {
      if (field.required) {
        const val = answers[field.id];
        if (field.type === 'checkbox' && val !== true) {
          setErrorMsg(`Please check "${field.label}" to continue.`);
          return;
        }
        if (field.type !== 'checkbox' && !String(val || '').trim()) {
          setErrorMsg(`Please fill out "${field.label}".`);
          return;
        }
      }
    }

    let activeProfile = profile;
    if (!user || !activeProfile) {
      activeProfile = await signInWithGoogle();
      if (!activeProfile) {
        setErrorMsg('Please sign in with Google to submit your response securely.');
        return;
      }
    }

    setSubmitting(true);
    try {
      await submitPostForm(post, activeProfile, answers);
      setDone(true);
      onSubmitted(`Response submitted to ${post.authorName}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to submit form right now.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="form-modal-title"
    >
      <div className="w-full max-w-lg bg-white border border-[#E7E5E0] rounded-2xl shadow-xl overflow-hidden my-8">
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-[#E7E5E0]">
          <div>
            <p className="text-xs font-medium text-[#5E5D59]">
              {post.authorName} · {post.authorLocation}
            </p>
            <h3 id="form-modal-title" className="font-display text-xl font-bold text-[#141413] mt-1">
              {post.formConfig.title || post.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close form"
            className="p-2 text-[#5E5D59] hover:text-[#141413] rounded-lg hover:bg-[#FAF9F7] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {done ? (
            <div className="py-6 text-center space-y-4">
              <CheckCircle2 className="w-12 h-12 text-[#0E7C5B] mx-auto" />
              <h4 className="font-display text-lg font-semibold text-[#141413]">
                Your response has been recorded
              </h4>
              <p className="text-sm text-[#5E5D59] max-w-sm mx-auto">
                {post.authorName} can now review your submission securely from their dashboard.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] cursor-pointer"
              >
                Done
              </button>
            </div>
          ) : !post.formConfig.isOpen ? (
            <div className="py-6 text-center space-y-3">
              <p className="text-base font-semibold text-[#141413]">
                Submissions are currently closed
              </p>
              <p className="text-sm text-[#5E5D59]">
                The organizer has paused responses for this form.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium border border-[#D4D1CA] rounded-lg text-[#141413] hover:bg-[#FAF9F7] cursor-pointer"
              >
                Close
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {post.formConfig.description && (
                <p className="text-sm text-[#5E5D59] leading-relaxed">
                  {post.formConfig.description}
                </p>
              )}

              {!user && (
                <div className="p-3.5 rounded-lg bg-[#FAF9F7] border border-[#E7E5E0] text-xs text-[#5E5D59]">
                  Signing in with Google is required when submitting so creators know who responded.
                </div>
              )}

              {post.formConfig.fields.length === 0 ? (
                <p className="text-sm text-[#5E5D59]">
                  Confirm your interest below to submit your RSVP to {post.authorName}.
                </p>
              ) : (
                <div className="space-y-4">
                  {post.formConfig.fields.map((field) => {
                    const value = answers[field.id];
                    return (
                      <div key={field.id}>
                        {field.type !== 'checkbox' && (
                          <label className="block text-sm font-medium text-[#141413] mb-1.5">
                            {field.label}
                            {field.required && <span className="text-[#B91C1C] ml-1">*</span>}
                          </label>
                        )}

                        {field.type === 'textarea' ? (
                          <textarea
                            rows={3}
                            required={field.required}
                            value={String(value ?? '')}
                            onChange={(e) =>
                              setAnswers((prev) => ({ ...prev, [field.id]: e.target.value }))
                            }
                            className="w-full px-3 py-2 text-sm bg-white border border-[#D4D1CA] rounded-lg focus:outline-none focus:border-[#0E7C5B]"
                          />
                        ) : field.type === 'select' ? (
                          <select
                            required={field.required}
                            value={String(value ?? '')}
                            onChange={(e) =>
                              setAnswers((prev) => ({ ...prev, [field.id]: e.target.value }))
                            }
                            className="w-full px-3 py-2 text-sm bg-white border border-[#D4D1CA] rounded-lg focus:outline-none focus:border-[#0E7C5B]"
                          >
                            {field.options.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : field.type === 'checkbox' ? (
                          <label className="flex items-center gap-2.5 p-3 border border-[#E7E5E0] rounded-lg bg-[#FAF9F7] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(value)}
                              onChange={(e) =>
                                setAnswers((prev) => ({ ...prev, [field.id]: e.target.checked }))
                              }
                              className="w-4 h-4 accent-[#0E7C5B] cursor-pointer"
                            />
                            <span className="text-sm text-[#141413]">
                              {field.label}
                              {field.required && <span className="text-[#B91C1C] ml-1">*</span>}
                            </span>
                          </label>
                        ) : (
                          <input
                            type={field.type}
                            required={field.required}
                            value={String(value ?? '')}
                            onChange={(e) =>
                              setAnswers((prev) => ({ ...prev, [field.id]: e.target.value }))
                            }
                            className="w-full px-3 py-2 text-sm bg-white border border-[#D4D1CA] rounded-lg focus:outline-none focus:border-[#0E7C5B]"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {errorMsg && (
                <p className="text-sm text-[#B91C1C] bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {errorMsg}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-[#5E5D59] hover:text-[#141413] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || authBusy}
                  className="px-5 py-2 text-sm font-semibold text-white bg-[#0E7C5B] rounded-lg hover:bg-[#095E44] disabled:opacity-60 cursor-pointer"
                >
                  {submitting
                    ? 'Submitting...'
                    : user
                      ? 'Submit Form'
                      : 'Sign In & Submit'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
