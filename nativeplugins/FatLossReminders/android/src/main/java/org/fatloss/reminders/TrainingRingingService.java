package org.fatloss.reminders;

import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/** 到时短响：前台服务承载播放器，最多 10 秒，结束即释放，不常驻。 */
public final class TrainingRingingService extends Service {
    /** 用户或设置变更要求停止：本次结束且不保留通知。 */
    static final String ACTION_STOP = "org.fatloss.reminders.RINGING_STOP";
    private static final long MAX_RINGING_MILLIS = 10_000L;
    private static volatile boolean ringing = false;

    static boolean isRinging() { return ringing; }

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final AlarmPlayer player = new AlarmPlayer();
    /** 自然到点满 10 秒上限：结束本次但保留这次训练通知。 */
    private final Runnable expiry = () -> finish(true);
    private boolean finished;

    @Override public IBinder onBind(Intent intent) { return null; }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_STOP.equals(action)) { finish(false); return START_NOT_STICKY; }
        // 先满足前台服务约定，再校验代次、模式与星期；过期的交接只结束自己。
        startForeground(TrainingScheduler.RING_NOTIFICATION_ID, TrainingScheduler.ringingNotification(this));
        if (intent == null || !TrainingScheduler.acceptRing(this, intent)) { finish(false); return START_NOT_STICKY; }
        Uri preferred = TrainingScheduler.ringUri(this);
        boolean usedFallback = false;
        boolean started = player.start(this, preferred, true, () -> finish(false));
        if (!started && TrainingScheduler.hasCustomSound(this)) {
            // 铃声标识失效：回退到系统默认闹钟铃声并留下提示，不宣称已按所选铃声响。
            TrainingScheduler.markRingFallback(this);
            usedFallback = true;
            started = player.start(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), true, () -> finish(false));
        }
        if (!started) {
            // 无法播放时保留可用通知并说明具体状态。
            TrainingScheduler.reportRingFailure(this, "playback-failed");
            finish(false);
            TrainingScheduler.notifyTrainingFallback(this);
            return START_NOT_STICKY;
        }
        if (!usedFallback) TrainingScheduler.clearRingFallback(this);
        ringing = true;
        handler.removeCallbacks(expiry);
        handler.postDelayed(expiry, MAX_RINGING_MILLIS);
        return START_NOT_STICKY;
    }

    @Override public void onDestroy() {
        finish(false);
        super.onDestroy();
    }

    /** 幂等结束：结束前台服务、释放播放器，只在自然满上限时保留这次训练通知。 */
    private void finish(boolean keepNotification) {
        handler.removeCallbacks(expiry);
        if (finished) return;
        finished = true;
        boolean wasRinging = ringing;
        ringing = false;
        player.stop();
        try { stopForeground(false); } catch (Exception ignored) { }
        if (wasRinging && keepNotification) TrainingScheduler.settleRingingNotification(this);
        else {
            try { ((NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE)).cancel(TrainingScheduler.RING_NOTIFICATION_ID); }
            catch (Exception ignored) { }
        }
        stopSelf();
    }
}
