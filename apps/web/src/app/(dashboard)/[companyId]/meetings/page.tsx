'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Mic,
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ListChecks,
  Lightbulb,
  Target,
  MessageSquare,
  Trash2,
  Play,
  RefreshCw,
  BookOpen,
  TrendingUp,
  MessageCircleWarning,
  Tags,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth-store';
import { KnowledgeTabs } from '@/components/knowledge/knowledge-tabs';
import { api } from '@/lib/api/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiErrorFromResponse, friendlyError } from '@/lib/friendly-errors';

const statusConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  uploading: { icon: Clock, color: 'text-blue-600', label: 'Awaiting Transcript' },
  transcribing: { icon: Loader2, color: 'text-amber-600', label: 'Analyzing...' },
  analyzed: { icon: Sparkles, color: 'text-purple-600', label: 'Ready for Review' },
  approved: { icon: CheckCircle2, color: 'text-green-600', label: 'Approved' },
};

function EmptyInsight({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}

function getSupportedRecordingFormat(): { mimeType?: string; extension: string } {
  if (typeof MediaRecorder === 'undefined') return { extension: 'webm' };

  const formats = [
    { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
    { mimeType: 'audio/webm', extension: 'webm' },
    { mimeType: 'audio/mp4', extension: 'm4a' },
    { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' },
  ];

  return formats.find(({ mimeType }) => MediaRecorder.isTypeSupported(mimeType))
    || { extension: 'webm' };
}

export default function MeetingsPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardRecordingRef = useRef(false);
  const [transcriptDialog, setTranscriptDialog] = useState(false);
  const [transcriptTitle, setTranscriptTitle] = useState('');
  const [transcriptText, setTranscriptText] = useState('');
  const [transcriptMeetingId, setTranscriptMeetingId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<any | null>(null);
  const [audioPreview, setAudioPreview] = useState<{ meetingId: string; url: string } | null>(null);
  const audioPreviewUrlRef = useRef<string | null>(null);
  const [loadingAudioId, setLoadingAudioId] = useState<string | null>(null);
  const [meetingToDiscard, setMeetingToDiscard] = useState<any | null>(null);
  const [isDiscardingMeeting, setIsDiscardingMeeting] = useState(false);
  const [transcriptPreview, setTranscriptPreview] = useState<{ title: string; transcript: string } | null>(null);
  const [reanalyzingMeetingId, setReanalyzingMeetingId] = useState<string | null>(null);

  useEffect(() => () => {
    if (audioPreviewUrlRef.current) URL.revokeObjectURL(audioPreviewUrlRef.current);
  }, []);

  // Fetch meetings
  const { data: meetingsData, isLoading } = useQuery({
    queryKey: ['meetings', companyId],
    queryFn: () => api.get<{ data: any[] }>(`/meetings/company/${companyId}`, { token: token! }),
    enabled: !!token,
    refetchInterval: 5000,
  });

  const meetingsList = meetingsData?.data || [];

  // Upload audio
  const handleUpload = async (file: File) => {
    if (!token) return;
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', file.name.replace(/\.[^/.]+$/, ''));

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1'}/meetings/company/${companyId}/upload`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );
      if (!res.ok) {
        throw await apiErrorFromResponse(res, 'Upload failed');
      }
      const data = await res.json().catch(() => ({}));

      if (data.needsTranscript) {
        toast.info('Audio uploaded. Please add transcript manually (no Whisper API key).');
        setTranscriptMeetingId(data.id);
        setTranscriptTitle(data.title || '');
        setTranscriptDialog(true);
      } else {
        toast.success('Meeting uploaded and analyzed!');
      }
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    } catch (error) {
      toast.error(friendlyError(error, 'Upload failed'));
    } finally {
      setIsUploading(false);
    }
  };

  // Submit transcript
  const handleSubmitTranscript = async () => {
    if (!token || !transcriptText.trim()) return;
    setIsSubmitting(true);
    try {
      await api.post(
        `/meetings/company/${companyId}/add-transcript`,
        {
          meetingId: transcriptMeetingId || undefined,
          title: transcriptTitle || 'Meeting Transcript',
          transcript: transcriptText,
        },
        { token }
      );
      toast.success('Transcript analyzed! Review the insights.');
      setTranscriptDialog(false);
      setTranscriptText('');
      setTranscriptTitle('');
      setTranscriptMeetingId(null);
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    } catch {
      toast.error('Failed to analyze transcript');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReanalyze = async (meetingId: string) => {
    if (!token) return;
    setReanalyzingMeetingId(meetingId);
    try {
      await api.post(
        `/meetings/company/${companyId}/${meetingId}/reanalyze`,
        {},
        { token },
      );
      toast.success('AI insights updated from the full transcript.');
      await queryClient.invalidateQueries({ queryKey: ['meetings', companyId] });
      setExpandedMeeting(meetingId);
    } catch (error) {
      toast.error(friendlyError(error, 'Could not analyze this meeting again.'));
    } finally {
      setReanalyzingMeetingId(null);
    }
  };

  // Approve meeting
  const handleApprove = async (meetingId: string) => {
    if (!token) return;
    try {
      const result = await api.patch<{ knowledgeSaved: number; tasksSaved: number; indexingFailed?: number }>(
        `/meetings/company/${companyId}/${meetingId}/approve`,
        {},
        { token }
      );
      if (result.indexingFailed) {
        toast.warning(
          `Approved ${result.knowledgeSaved} insights and ${result.tasksSaved} tasks. Search indexing will retry automatically.`
        );
      } else {
        toast.success(
          `Approved! ${result.knowledgeSaved} knowledge entries + ${result.tasksSaved} tasks created.`
        );
      }
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    } catch {
      toast.error('Approve failed');
    }
  };

  const closeAudioPreview = () => {
    if (audioPreviewUrlRef.current) {
      URL.revokeObjectURL(audioPreviewUrlRef.current);
      audioPreviewUrlRef.current = null;
    }
    setAudioPreview(null);
  };

  const handleListen = async (meetingId: string) => {
    if (!token) return;
    if (audioPreview?.meetingId === meetingId) {
      closeAudioPreview();
      return;
    }

    setLoadingAudioId(meetingId);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8004/api/v1'}/meetings/company/${companyId}/${meetingId}/audio`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!response.ok) throw new Error('Recording is unavailable');

      const blobUrl = URL.createObjectURL(await response.blob());
      closeAudioPreview();
      audioPreviewUrlRef.current = blobUrl;
      setAudioPreview({ meetingId, url: blobUrl });
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't play this recording. Please try again."));
    } finally {
      setLoadingAudioId(null);
    }
  };

  const handleDiscardMeeting = async () => {
    if (!token || !meetingToDiscard) return;
    setIsDiscardingMeeting(true);
    try {
      await api.delete(`/meetings/company/${companyId}/${meetingToDiscard.id}`, { token });
      if (audioPreview?.meetingId === meetingToDiscard.id) closeAudioPreview();
      setMeetingToDiscard(null);
      toast.success('Meeting recording discarded.');
      await queryClient.invalidateQueries({ queryKey: ['meetings', companyId] });
    } catch (err) {
      toast.error(friendlyError(err, "We couldn't discard this meeting. Please try again."));
    } finally {
      setIsDiscardingMeeting(false);
    }
  };

  // View meeting detail
  const handleViewMeeting = async (meetingId: string) => {
    if (!token) return;
    try {
      const data = await api.get<any>(`/meetings/company/${companyId}/${meetingId}`, { token });
      setSelectedMeeting(data);
    } catch {
      toast.error('Failed to load meeting');
    }
  };

  // Start recording
  const handleStartRecording = async () => {
    let stream: MediaStream | null = null;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        toast.error('Audio recording is not supported by this browser. Please upload an audio file instead.');
        return;
      }

      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const activeStream = stream;
      const recordingFormat = getSupportedRecordingFormat();
      const mediaRecorder = recordingFormat.mimeType
        ? new MediaRecorder(activeStream, { mimeType: recordingFormat.mimeType })
        : new MediaRecorder(activeStream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      discardRecordingRef.current = false;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        activeStream.getTracks().forEach((t) => t.stop());
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }

        setRecordingTime(0);
        setIsRecording(false);
        mediaRecorderRef.current = null;

        if (discardRecordingRef.current) {
          discardRecordingRef.current = false;
          chunksRef.current = [];
          toast.info('Recording discarded. Nothing was uploaded.');
          return;
        }

        const recordedMimeType = mediaRecorder.mimeType
          || chunksRef.current.find((chunk) => chunk.type)?.type
          || recordingFormat.mimeType
          || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: recordedMimeType });
        chunksRef.current = [];
        if (blob.size === 0) {
          toast.error('No audio was recorded. Please try again.');
          return;
        }
        const file = new File(
          [blob],
          `recording-${Date.now()}.${recordingFormat.extension}`,
          { type: recordedMimeType },
        );

        // Browser recordings intentionally reuse the exact upload/transcribe/analyze pipeline.
        await handleUpload(file);
      };

      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);

      toast.success('Recording started');
    } catch (err) {
      stream?.getTracks().forEach((track) => track.stop());
      toast.error('Could not start recording. Check microphone permission or upload an audio file instead.');
    }
  };

  // Stop recording
  const handleStopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && isRecording && recorder.state !== 'inactive') {
      discardRecordingRef.current = false;
      recorder.stop();
      toast.success('Recording saved — AI is analyzing...');
    }
  };

  // Stop the microphone and clear the browser buffer without uploading it.
  const handleDiscardRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && isRecording && recorder.state !== 'inactive') {
      discardRecordingRef.current = true;
      recorder.stop();
    }
  };

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const pendingReview = meetingsList.filter((m: any) => m.status === 'analyzed').length;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <KnowledgeTabs />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Meeting Intelligence</h1>
          <p className="text-muted-foreground">Upload meetings, extract insights with AI</p>
        </div>
        {pendingReview > 0 && (
          <Badge variant="outline" className="gap-1 text-purple-600 border-purple-300">
            <Sparkles className="w-3 h-3" />
            {pendingReview} ready for review
          </Badge>
        )}
      </div>

      {/* Upload / Record Area */}
      {isRecording ? (
        /* Recording in progress */
        <Card className="border-2 border-red-300 bg-red-50/50">
          <CardContent className="pt-6 pb-6">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-3 animate-pulse">
                <Mic className="w-8 h-8 text-red-500" />
              </div>
              <p className="font-semibold text-red-700 mb-1">Recording in progress</p>
              <p className="text-3xl font-mono text-red-600 mb-4">{formatTime(recordingTime)}</p>
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-center gap-2">
                <Button variant="outline" onClick={handleDiscardRecording} className="gap-2 bg-white" size="lg">
                  <Trash2 className="w-4 h-4" /> Discard
                </Button>
                <Button variant="destructive" onClick={handleStopRecording} className="gap-2" size="lg">
                  <span className="w-3 h-3 bg-white rounded-sm" /> Stop &amp; Save
                </Button>
              </div>
              <p className="text-xs text-red-700/80 mt-3">
                Stop &amp; Save uploads this recording. Discard deletes it from this device.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed border-2 hover:border-primary/50 transition-colors">
          <CardContent className="pt-6 pb-6">
            <div className="text-center">
              <Mic className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="font-medium mb-1">Add a meeting</p>
              <p className="text-sm text-muted-foreground mb-4">
                Record, upload audio, or paste a transcript
              </p>
              <div className="flex items-center justify-center gap-3">
                <input ref={fileInputRef} type="file" className="hidden" accept=".mp3,.wav,.m4a,.ogg,.webm"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} />
                <Button onClick={handleStartRecording} className="gap-2 bg-red-500 hover:bg-red-600">
                  <Mic className="w-4 h-4" /> Start Recording
                </Button>
                <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading} variant="outline" className="gap-2">
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  Upload Audio
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => {
                  setTranscriptMeetingId(null); setTranscriptTitle(''); setTranscriptText('');
                  setTranscriptDialog(true);
                }}>
                  <FileText className="w-4 h-4" /> Paste Transcript
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Meeting List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : meetingsList.length === 0 ? (
        <Card className="p-12 text-center">
          <Mic className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <h3 className="font-semibold mb-1">No meetings yet</h3>
          <p className="text-sm text-muted-foreground">
            Upload audio recordings or paste transcripts to extract AI insights
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {meetingsList.map((meeting: any) => {
            const config = statusConfig[meeting.status] || statusConfig.uploading;
            const StatusIcon = config.icon;
            const isExpanded = expandedMeeting === meeting.id;
            const insights = meeting.insights;

            return (
              <Card key={meeting.id}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="p-2 bg-muted rounded-lg shrink-0">
                      <Mic className="w-4 h-4" />
                    </div>
                    <div className="min-w-[16rem] flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium text-sm truncate">{meeting.title}</p>
                        <Badge variant="outline" className={`text-xs gap-1 ${config.color}`}>
                          <StatusIcon
                            className={`w-3 h-3 ${meeting.status === 'transcribing' ? 'animate-spin' : ''}`}
                          />
                          {config.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(meeting.createdAt).toLocaleDateString()}
                        {insights?.summary && ` · ${insights.keyTopics?.length || 0} topics`}
                      </p>

                      {audioPreview?.meetingId === meeting.id && (
                        <div className="mt-3 rounded-md bg-muted/50 p-2">
                          <audio
                            src={audioPreview?.url}
                            controls
                            autoPlay
                            preload="metadata"
                            className="h-10 w-full"
                          >
                            Your browser does not support audio playback.
                          </audio>
                        </div>
                      )}

                      {/* Quick insights preview */}
                      {insights && (
                        <button
                          onClick={() => setExpandedMeeting(isExpanded ? null : meeting.id)}
                          className="text-xs text-primary mt-2 flex items-center gap-1"
                        >
                          {isExpanded ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                          {isExpanded ? 'Hide' : 'View'} AI insights
                        </button>
                      )}

                      {isExpanded && insights && (
                        <div className="mt-3 space-y-3">
                          {/* Summary */}
                          <div className="p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center gap-1 mb-1 text-xs font-medium">
                              <MessageSquare className="w-3 h-3" /> Summary
                            </div>
                            {insights.summary ? (
                              <p className="text-sm">{insights.summary}</p>
                            ) : (
                              <EmptyInsight>No readable summary was found.</EmptyInsight>
                            )}
                          </div>

                          {/* Grounded highlights are expected for every readable transcript. */}
                          <div className="p-3 bg-violet-50 dark:bg-violet-950/20 rounded-lg">
                            <div className="flex items-center gap-1 mb-2 text-xs font-medium text-violet-700 dark:text-violet-400">
                              <BookOpen className="w-3 h-3" /> Key points ({insights.highlights?.length || 0})
                            </div>
                            {insights.highlights?.length > 0 ? (
                              <ul className="space-y-1">
                                {insights.highlights.map((point: string, i: number) => (
                                  <li key={i} className="text-sm flex items-start gap-2">
                                    <span className="text-violet-500 mt-1">-</span>
                                    {point}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <EmptyInsight>
                                This meeting was analyzed before key points were available. Use Analyze again below.
                              </EmptyInsight>
                            )}
                          </div>

                          <div className="grid gap-3 lg:grid-cols-2">
                            {/* Decisions */}
                            <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                              <div className="flex items-center gap-1 mb-2 text-xs font-medium text-blue-700 dark:text-blue-400">
                                <Target className="w-3 h-3" /> Decisions ({insights.decisions?.length || 0})
                              </div>
                              {insights.decisions?.length > 0 ? (
                                <ul className="space-y-1">
                                  {insights.decisions.map((d: string, i: number) => (
                                    <li key={i} className="text-sm flex items-start gap-2">
                                      <span className="text-blue-500 mt-1">-</span>
                                      {d}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <EmptyInsight>No explicit decision was made in this recording.</EmptyInsight>
                              )}
                            </div>

                            {/* Action Items */}
                            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                              <div className="flex items-center gap-1 mb-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                                <ListChecks className="w-3 h-3" /> Action Items ({insights.tasks?.length || 0})
                              </div>
                              {insights.tasks?.length > 0 ? (
                                <ul className="space-y-1">
                                  {insights.tasks.map((t: any, i: number) => (
                                    <li key={i} className="text-sm flex items-start gap-2">
                                      <span className="text-amber-500 mt-1">-</span>
                                      <div>
                                        {t.title}
                                        {t.assignee && (
                                          <span className="text-xs text-muted-foreground ml-1">
                                            ({t.assignee})
                                          </span>
                                        )}
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <EmptyInsight>No explicit action item was assigned in this recording.</EmptyInsight>
                              )}
                            </div>

                            {/* Strategies */}
                            <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                              <div className="flex items-center gap-1 mb-2 text-xs font-medium text-green-700 dark:text-green-400">
                                <Lightbulb className="w-3 h-3" /> Strategy Insights ({insights.strategies?.length || 0})
                              </div>
                              {insights.strategies?.length > 0 ? (
                                <ul className="space-y-1">
                                  {insights.strategies.map((s: string, i: number) => (
                                    <li key={i} className="text-sm flex items-start gap-2">
                                      <span className="text-green-500 mt-1">-</span> {s}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <EmptyInsight>No business approach or positioning was described.</EmptyInsight>
                              )}
                            </div>

                            {/* Market and customer evidence */}
                            <div className="p-3 bg-cyan-50 dark:bg-cyan-950/20 rounded-lg">
                              <div className="flex items-center gap-1 mb-2 text-xs font-medium text-cyan-700 dark:text-cyan-400">
                                <TrendingUp className="w-3 h-3" /> Market &amp; Customer Insights ({insights.marketInsights?.length || 0})
                              </div>
                              {insights.marketInsights?.length > 0 ? (
                                <ul className="space-y-1">
                                  {insights.marketInsights.map((item: string, i: number) => (
                                    <li key={i} className="text-sm flex items-start gap-2">
                                      <span className="text-cyan-500 mt-1">-</span> {item}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <EmptyInsight>No market or customer evidence was mentioned.</EmptyInsight>
                              )}
                            </div>

                            {/* Sales objections */}
                            <div className="p-3 bg-rose-50 dark:bg-rose-950/20 rounded-lg lg:col-span-2">
                              <div className="flex items-center gap-1 mb-2 text-xs font-medium text-rose-700 dark:text-rose-400">
                                <MessageCircleWarning className="w-3 h-3" /> Sales Objections ({insights.salesObjections?.length || 0})
                              </div>
                              {insights.salesObjections?.length > 0 ? (
                                <ul className="space-y-1">
                                  {insights.salesObjections.map((item: string, i: number) => (
                                    <li key={i} className="text-sm flex items-start gap-2">
                                      <span className="text-rose-500 mt-1">-</span> {item}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <EmptyInsight>No customer objection was mentioned in this recording.</EmptyInsight>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2 rounded-lg border border-border/70 p-3">
                            <div className="flex items-center gap-1 text-xs font-medium">
                              <Tags className="h-3 w-3" /> Topics &amp; keywords
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {(insights.keyTopics || []).map((topic: string, i: number) => (
                                <Badge key={`topic-${i}`} variant="secondary" className="text-[10px]">
                                  {topic}
                                </Badge>
                              ))}
                              {(insights.keywords || [])
                                .filter((keyword: string) => !(insights.keyTopics || []).includes(keyword))
                                .map((keyword: string, i: number) => (
                                  <Badge key={`keyword-${i}`} variant="outline" className="text-[10px]">
                                    {keyword}
                                  </Badge>
                                ))}
                              {!insights.keyTopics?.length && !insights.keywords?.length && (
                                <EmptyInsight>No topics were extracted yet. Use Analyze again below.</EmptyInsight>
                              )}
                            </div>
                          </div>

                          {meeting.status !== 'approved' && meeting.transcript && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="gap-2"
                              disabled={reanalyzingMeetingId === meeting.id}
                              onClick={() => handleReanalyze(meeting.id)}
                            >
                              {reanalyzingMeetingId === meeting.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                              )}
                              {reanalyzingMeetingId === meeting.id ? 'Analyzing full transcript...' : 'Analyze again'}
                            </Button>
                          )}

                          {/* Transcript (expandable) */}
                          {meeting.transcript && (
                            <details className="text-xs">
                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                Transcript preview
                              </summary>
                              <pre className="mt-2 max-h-[420px] overflow-y-auto rounded-lg bg-muted p-3 font-mono text-[11px] whitespace-pre-wrap">
                                {meeting.transcript}
                              </pre>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-2 h-8 text-xs"
                                onClick={() => setTranscriptPreview({
                                  title: meeting.title,
                                  transcript: meeting.transcript,
                                })}
                              >
                                Open full transcript
                              </Button>
                            </details>
                          )}
                        </div>
                      )}

                      {/* Add transcript prompt for uploading status */}
                      {meeting.status === 'uploading' && !meeting.transcript && (
                        <Button
                          variant="link"
                          size="sm"
                          className="p-0 h-auto mt-2 text-xs"
                          onClick={() => {
                            setTranscriptMeetingId(meeting.id);
                            setTranscriptTitle(meeting.title);
                            setTranscriptText('');
                            setTranscriptDialog(true);
                          }}
                        >
                          Add transcript manually
                        </Button>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-1.5">
                      {meeting.audioUrl && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          disabled={loadingAudioId === meeting.id}
                          onClick={() => handleListen(meeting.id)}
                        >
                          {loadingAudioId === meeting.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                          {audioPreview?.meetingId === meeting.id ? 'Hide audio' : 'Listen'}
                        </Button>
                      )}
                      {meeting.status !== 'approved' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => setMeetingToDiscard(meeting)}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Discard
                        </Button>
                      )}
                      {meeting.status === 'analyzed' && (
                        <Button
                          size="sm"
                          className="gap-1.5 bg-green-600 text-white hover:bg-green-700"
                          onClick={() => handleApprove(meeting.id)}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Transcript Dialog */}
      <Dialog open={transcriptDialog} onOpenChange={setTranscriptDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Meeting Transcript</DialogTitle>
            <DialogDescription>
              Paste your meeting transcript and AI will extract insights
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-3">
            <div>
              <Label>Meeting Title</Label>
              <Input
                value={transcriptTitle}
                onChange={(e) => setTranscriptTitle(e.target.value)}
                placeholder="e.g. Weekly Team Standup"
                className="mt-1"
              />
            </div>
            <div>
              <Label>Transcript</Label>
              <Textarea
                value={transcriptText}
                onChange={(e) => setTranscriptText(e.target.value)}
                placeholder="Paste your meeting transcript here..."
                className="mt-1 min-h-[200px] font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTranscriptDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitTranscript}
              disabled={!transcriptText.trim() || isSubmitting}
              className="gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Analyze with AI
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!transcriptPreview} onOpenChange={() => setTranscriptPreview(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{transcriptPreview?.title || 'Meeting transcript'}</DialogTitle>
            <DialogDescription>
              Full transcript captured from the uploaded recording or pasted text.
            </DialogDescription>
          </DialogHeader>
          <pre className="max-h-[70vh] overflow-y-auto rounded-lg bg-muted p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {transcriptPreview?.transcript || ''}
          </pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTranscriptPreview(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!meetingToDiscard}
        onOpenChange={(open) => {
          if (!open && !isDiscardingMeeting) setMeetingToDiscard(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Discard this meeting?</DialogTitle>
            <DialogDescription>
              The recording and its AI insights will be permanently removed. Nothing from this
              meeting will be added to your Knowledge Hub.
            </DialogDescription>
          </DialogHeader>
          {meetingToDiscard?.title && (
            <div className="rounded-md bg-muted px-3 py-2 text-sm font-medium">
              {meetingToDiscard.title}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isDiscardingMeeting}
              onClick={() => setMeetingToDiscard(null)}
            >
              Keep meeting
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              disabled={isDiscardingMeeting}
              onClick={handleDiscardMeeting}
            >
              {isDiscardingMeeting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Discard permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
