package org.fatloss.reminders;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/** Seven stable alarms, persisted desired state, and no server or exercise data. */
public final class TrainingScheduler {
    static final String ACTION = "org.fatloss.reminders.TRAINING";
    static final int RING_NOTIFICATION_ID = 7201;
    private static final int FALLBACK_NOTIFICATION_ID = 7202;
    private static final String PREFS = "fat-loss-training-reminders-v1";
    private static final String CHANNEL = "fat-loss-training";
    private static final String RING_CHANNEL = "fat-loss-training-ring";
    private static final int BASE_ID = 7100;
    private static final String MODE_NOTIFICATION = "notification";
    private static final String MODE_RING = "ring";

    private TrainingScheduler() {}
    private static SharedPreferences prefs(Context context) { return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private static NotificationManager manager(Context context) { return (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE); }

    static void createChannels(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager notifications = manager(context);
        // 普通通知沿用系统渠道声音；响铃模式的通知本身不出声，避免与主动短响形成双重铃声。
        notifications.createNotificationChannel(new NotificationChannel(CHANNEL, "训练提醒", NotificationManager.IMPORTANCE_DEFAULT));
        notifications.createNotificationChannel(new NotificationChannel(RING_CHANNEL, "训练响铃提醒", NotificationManager.IMPORTANCE_LOW));
    }

    static boolean permitted(Context context) {
        createChannels(context);
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        if (Build.VERSION.SDK_INT >= 24 && !manager(context).areNotificationsEnabled()) return false;
        return Build.VERSION.SDK_INT < 26 || manager(context).getNotificationChannel(CHANNEL).getImportance() != NotificationManager.IMPORTANCE_NONE;
    }

    static boolean soundPermitted(Context context) {
        createChannels(context);
        if (Build.VERSION.SDK_INT < 26) return true;
        NotificationChannel channel = manager(context).getNotificationChannel(CHANNEL);
        return channel.getImportance() >= NotificationManager.IMPORTANCE_DEFAULT && channel.getSound() != null;
    }

    static boolean ringChannelEnabled(Context context) {
        createChannels(context);
        if (Build.VERSION.SDK_INT < 26) return true;
        NotificationChannel channel = manager(context).getNotificationChannel(RING_CHANNEL);
        return channel != null && channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
    }

    static boolean exactPermitted(Context context) {
        return Build.VERSION.SDK_INT < 31 || ((AlarmManager) context.getSystemService(Context.ALARM_SERVICE)).canScheduleExactAlarms();
    }

    static String savedMode(Context context) { return MODE_RING.equals(prefs(context).getString("mode", MODE_NOTIFICATION)) ? MODE_RING : MODE_NOTIFICATION; }
    static String savedSound(Context context) { String sound = prefs(context).getString("sound", ""); return sound == null ? "" : sound; }
    static boolean hasCustomSound(Context context) { return !savedSound(context).isEmpty(); }
    /** 上次到时无法按所选模式响铃的原因代码，读走后清空。 */
    static String ringError(Context context) { String error = prefs(context).getString("ringError", ""); return error == null ? "" : error; }
    static boolean ringFallback(Context context) { return prefs(context).getBoolean("ringFallback", false); }
    static void markRingFallback(Context context) { prefs(context).edit().putBoolean("ringFallback", true).commit(); }
    static void clearRingFallback(Context context) { prefs(context).edit().remove("ringFallback").commit(); }

    static void reportRingFailure(Context context, String code) { prefs(context).edit().putString("ringError", code).commit(); }
    static void clearRingError(Context context) { prefs(context).edit().remove("ringError").commit(); }

    private static boolean delivered(Context context, int day, long occurrence) { return prefs(context).getLong("delivered-" + day, 0) >= occurrence; }

    static Uri ringUri(Context context) {
        Uri saved = parseRingtone(savedSound(context));
        return saved != null ? saved : RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
    }

    private static Uri parseRingtone(String value) {
        String trimmed = value == null ? "" : value.trim();
        if (trimmed.isEmpty()) return null;
        try { return Uri.parse(trimmed); } catch (Exception invalid) { return null; }
    }

    /** 当前系统状态下主动响铃的硬性阻碍；空列表且无未确认项时才表示可响。 */
    static List<String> ringBlockers(Context context) {
        List<String> blockers = new ArrayList<>();
        if (!permitted(context)) { blockers.add("notification-permission"); return blockers; }
        if (!ringChannelEnabled(context)) blockers.add("ring-channel");
        String ringer = ringerMode(context);
        if ("silent".equals(ringer) || "vibrate".equals(ringer)) blockers.add("silent");
        int volume = alarmVolume(context);
        if (volume == 0) blockers.add("volume-zero");
        if (Boolean.TRUE.equals(dndActive(context))) blockers.add("dnd");
        return blockers;
    }

    /** 读不到状态时如实上报，界面不得据此宣称没有阻碍。 */
    static List<String> ringUnverified(Context context) {
        List<String> unverified = new ArrayList<>();
        if (dndActive(context) == null) unverified.add("dnd");
        if (alarmVolume(context) < 0) unverified.add("alarm-volume");
        return unverified;
    }

    static String ringerMode(Context context) {
        AudioManagerHolder holder = new AudioManagerHolder(context);
        return holder.ringerMode();
    }

    static int alarmVolume(Context context) { return new AudioManagerHolder(context).alarmVolume(); }
    static int alarmVolumeMax(Context context) { return new AudioManagerHolder(context).alarmVolumeMax(); }

    /** null 表示读不到勿扰状态。 */
    static Boolean dndActive(Context context) {
        try {
            int filter = manager(context).getCurrentInterruptionFilter();
            if (filter == NotificationManager.INTERRUPTION_FILTER_UNKNOWN) return null;
            return filter != NotificationManager.INTERRUPTION_FILTER_ALL;
        } catch (Exception unknown) { return null; }
    }

    private static PendingIntent alarmIntent(Context context, int weekday, int generation, long occurrence) {
        Intent intent = new Intent(context, TrainingAlarmReceiver.class).setAction(ACTION);
        intent.putExtra("weekday", weekday).putExtra("generation", generation).putExtra("occurrence", occurrence);
        return PendingIntent.getBroadcast(context, BASE_ID + weekday, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static long nextOccurrence(int isoWeekday, int hour, int minute, long now) {
        Calendar next = Calendar.getInstance(); next.setTimeInMillis(now);
        next.set(Calendar.HOUR_OF_DAY, hour); next.set(Calendar.MINUTE, minute);
        next.set(Calendar.SECOND, 0); next.set(Calendar.MILLISECOND, 0);
        int javaWeekday = isoWeekday == 7 ? Calendar.SUNDAY : isoWeekday + 1;
        int days = (javaWeekday - next.get(Calendar.DAY_OF_WEEK) + 7) % 7;
        next.add(Calendar.DAY_OF_MONTH, days);
        if (next.getTimeInMillis() <= now) next.add(Calendar.DAY_OF_MONTH, 7);
        return next.getTimeInMillis();
    }

    /** 只结束本次响铃，保留下周安排；设置变更与关闭也复用它。 */
    static void stopRinging(Context context) {
        // 同进程停止服务会走 onDestroy 释放播放器，不受后台启动服务限制。
        try { context.stopService(new Intent(context, TrainingRingingService.class)); } catch (Exception ignored) { }
        try { manager(context).cancel(RING_NOTIFICATION_ID); } catch (Exception ignored) { }
    }

    private static void cancelAll(Context context) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        for (int day = 1; day <= 7; day++) {
            PendingIntent pending = alarmIntent(context, day, 0, 0);
            alarms.cancel(pending); pending.cancel();
            manager(context).cancel(BASE_ID + day);
        }
    }

    private static void schedule(Context context, int day, SharedPreferences state) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        long when = nextOccurrence(day, state.getInt("hour", 0), state.getInt("minute", 0), System.currentTimeMillis());
        PendingIntent pending = alarmIntent(context, day, state.getInt("generation", 0), when);
        if (exactPermitted(context)) {
            try { alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pending); return; }
            catch (SecurityException revoked) { /* Permission may change between checking and scheduling. */ }
        }
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pending);
    }

    static synchronized void replace(Context context, boolean enabled, int mask, int hour, int minute, String mode, String sound) {
        if (enabled && !permitted(context)) throw new IllegalStateException("通知权限或训练通知渠道未启用");
        if (enabled && (mask < 1 || mask > 127 || hour < 0 || hour > 23 || minute < 0 || minute > 59)) throw new IllegalArgumentException("训练星期或时间无效");
        // 先使旧代次失效：取消旧任务、关联通知和正在进行的响铃，再保存并重排未来事件。
        stopRinging(context);
        SharedPreferences state = prefs(context);
        int generation = state.getInt("generation", 0) + 1;
        boolean stored = state.edit()
                .putBoolean("enabled", enabled)
                .putInt("mask", enabled ? mask : 0)
                .putInt("hour", hour).putInt("minute", minute)
                .putString("mode", MODE_RING.equals(mode) ? MODE_RING : MODE_NOTIFICATION)
                .putString("sound", sound == null ? "" : sound)
                .putInt("generation", generation)
                .remove("ringFallback").remove("ringError")
                .commit();
        if (!stored) throw new IllegalStateException("保存系统训练提醒失败");
        cancelAll(context);
        if (enabled) for (int day = 1; day <= 7; day++) if ((mask & (1 << (day - 1))) != 0) schedule(context, day, state);
    }

    static synchronized void restore(Context context) {
        SharedPreferences state = prefs(context);
        stopRinging(context);
        cancelAll(context);
        if (state.getBoolean("enabled", false) && permitted(context)) {
            for (int day = 1; day <= 7; day++) if ((state.getInt("mask", 0) & (1 << (day - 1))) != 0) schedule(context, day, state);
        }
    }

    /** 短响服务只接受当前代次、当前模式与当前星期的交接。 */
    static synchronized boolean acceptRing(Context context, Intent intent) {
        SharedPreferences state = prefs(context);
        int day = intent.getIntExtra("weekday", 0);
        long occurrence = intent.getLongExtra("occurrence", 0);
        if (day < 1 || day > 7 || !state.getBoolean("enabled", false)) return false;
        if (!MODE_RING.equals(state.getString("mode", MODE_NOTIFICATION))) return false;
        if (intent.getIntExtra("generation", -1) != state.getInt("generation", 0)) return false;
        if ((state.getInt("mask", 0) & (1 << (day - 1))) == 0) return false;
        return occurrence > 0 && System.currentTimeMillis() >= occurrence;
    }

    static synchronized void deliver(Context context, Intent intent) {
        SharedPreferences state = prefs(context);
        int day = intent.getIntExtra("weekday", 0);
        long occurrence = intent.getLongExtra("occurrence", 0);
        if (day < 1 || day > 7 || !state.getBoolean("enabled", false) || intent.getIntExtra("generation", -1) != state.getInt("generation", 0) || (state.getInt("mask", 0) & (1 << (day - 1))) == 0) return;
        if (occurrence <= 0 || System.currentTimeMillis() < occurrence || delivered(context, day, occurrence)) return;
        // Re-arm before notifying, so revoking permission never produces a stale notification.
        schedule(context, day, state);
        if (!permitted(context)) return;
        if (!state.edit().putLong("delivered-" + day, occurrence).commit()) throw new IllegalStateException("保存训练通知状态失败");
        if (MODE_RING.equals(state.getString("mode", MODE_NOTIFICATION))) {
            if (ringBlockers(context).isEmpty()) {
                clearRingError(context);
                if (startRingingService(context, day, state.getInt("generation", 0), occurrence)) return;
                // 后台无法合法启动短响服务：明确降级为普通通知，保留用户所选模式。
                reportRingFailure(context, "background-service");
            }
            // 静音、勿扰、音量为零或渠道禁用时不主动响铃，只保留通知；阻碍由实时状态如实上报。
        }
        postTrainingNotification(context, day);
    }

    private static boolean startRingingService(Context context, int day, int generation, long occurrence) {
        Intent intent = new Intent(context, TrainingRingingService.class)
                .setAction(ACTION)
                .putExtra("weekday", day).putExtra("generation", generation).putExtra("occurrence", occurrence);
        try {
            if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent);
            else context.startService(intent);
            return true;
        } catch (Exception refused) {
            return false;
        }
    }

    private static PendingIntent launchIntent(Context context, int requestCode) {
        Intent launch = context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        if (launch == null) return null;
        return PendingIntent.getActivity(context, requestCode, launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static Notification build(Context context, String channel, String text, boolean ongoing, boolean withStop) {
        createChannels(context);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, channel) : new Notification.Builder(context);
        builder.setSmallIcon(context.getApplicationInfo().icon).setContentTitle("训练提醒").setContentText(text).setAutoCancel(!ongoing);
        if (ongoing) builder.setOngoing(true);
        PendingIntent launch = launchIntent(context, BASE_ID);
        if (launch != null) builder.setContentIntent(launch);
        if (withStop) {
            Intent stop = new Intent(context, TrainingRingingService.class).setAction(TrainingRingingService.ACTION_STOP);
            PendingIntent stopIntent = PendingIntent.getService(context, RING_NOTIFICATION_ID, stop, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            builder.addAction(new Notification.Action.Builder(null, "停止响铃", stopIntent).build());
        }
        if (Build.VERSION.SDK_INT < 26) builder.setDefaults(Notification.DEFAULT_SOUND);
        return builder.build();
    }

    /** 响铃中的前台服务通知：出字不出声，带明确停止入口。 */
    static Notification ringingNotification(Context context) {
        return build(context, RING_CHANNEL, "到了你设置的训练时间，正在短响，最多 10 秒。", true, true);
    }

    /** 响铃结束后的通知去掉了停止入口，但仍保留这次训练提醒。 */
    static void settleRingingNotification(Context context) {
        try { manager(context).notify(RING_NOTIFICATION_ID, build(context, RING_CHANNEL, "到了你设置的训练时间，可查看自己的训练计划。", false, false)); }
        catch (Exception ignored) { }
    }

    static void notifyTrainingFallback(Context context) {
        try { manager(context).notify(FALLBACK_NOTIFICATION_ID, build(context, CHANNEL, "到了你设置的训练时间，可查看自己的训练计划。", false, false)); }
        catch (Exception ignored) { }
    }

    private static void postTrainingNotification(Context context, int day) {
        try { manager(context).notify(BASE_ID + day, build(context, CHANNEL, "到了你设置的训练时间，可查看自己的训练计划。", false, false)); }
        catch (Exception ignored) { }
    }

    /** 原生只负责读取状态；音量与静音等改动一律由用户自行完成。 */
    private static final class AudioManagerHolder {
        private final android.media.AudioManager manager;
        AudioManagerHolder(Context context) { this.manager = (android.media.AudioManager) context.getSystemService(Context.AUDIO_SERVICE); }
        String ringerMode() {
            if (manager == null) return "unknown";
            try {
                switch (manager.getRingerMode()) {
                    case android.media.AudioManager.RINGER_MODE_SILENT: return "silent";
                    case android.media.AudioManager.RINGER_MODE_VIBRATE: return "vibrate";
                    case android.media.AudioManager.RINGER_MODE_NORMAL: return "normal";
                    default: return "unknown";
                }
            } catch (Exception failure) { return "unknown"; }
        }
        int alarmVolume() { try { return manager == null ? -1 : manager.getStreamVolume(android.media.AudioManager.STREAM_ALARM); } catch (Exception failure) { return -1; } }
        int alarmVolumeMax() { try { return manager == null ? -1 : manager.getStreamMaxVolume(android.media.AudioManager.STREAM_ALARM); } catch (Exception failure) { return -1; } }
    }
}
