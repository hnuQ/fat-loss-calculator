package org.fatloss.reminders;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.media.RingtoneManager;
import android.net.Uri;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import io.dcloud.common.core.permission.PermissionControler;
import io.dcloud.feature.uniapp.annotation.UniJSMethod;
import io.dcloud.feature.uniapp.bridge.UniJSCallback;
import io.dcloud.feature.uniapp.common.UniModule;

public final class TrainingRemindersModule extends UniModule {
    private static final int REQUEST = 710;
    private static final long PREVIEW_MILLIS = 3_000L;
    private UniJSCallback permissionCallback;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final AlarmPlayer previewPlayer = new AlarmPlayer();
    private final Runnable previewTimeout = () -> previewPlayer.stop();

    private Context context() { return mUniSDKInstance.getContext(); }

    private void result(UniJSCallback callback, boolean granted) {
        Context context = context();
        JSONObject result = new JSONObject();
        result.put("ok", true);
        result.put("granted", granted);
        result.put("exact", TrainingScheduler.exactPermitted(context));
        result.put("notifications", TrainingScheduler.permitted(context));
        result.put("sound", TrainingScheduler.soundPermitted(context));
        result.put("mode", TrainingScheduler.savedMode(context));
        result.put("ringtone", TrainingScheduler.savedSound(context));
        result.put("ringing", TrainingRingingService.isRinging());
        result.put("ringerMode", TrainingScheduler.ringerMode(context));
        int volume = TrainingScheduler.alarmVolume(context);
        int maximum = TrainingScheduler.alarmVolumeMax(context);
        if (volume >= 0) result.put("alarmVolume", volume);
        if (maximum > 0) result.put("alarmVolumeMax", maximum);
        Boolean dnd = TrainingScheduler.dndActive(context);
        if (dnd != null) result.put("dnd", dnd.booleanValue());
        result.put("ringChannel", TrainingScheduler.ringChannelEnabled(context));
        result.put("blockers", strings(TrainingScheduler.ringBlockers(context)));
        result.put("unverified", strings(TrainingScheduler.ringUnverified(context)));
        result.put("ringtoneFallback", TrainingScheduler.ringFallback(context));
        String error = TrainingScheduler.ringError(context);
        if (!error.isEmpty()) result.put("ringError", error);
        callback.invoke(result);
    }

    private static JSONArray strings(java.util.List<String> values) {
        JSONArray array = new JSONArray();
        for (String value : values) array.add(value);
        return array;
    }

    private void error(UniJSCallback callback, String message) {
        JSONObject result = new JSONObject(); result.put("ok", false); result.put("error", message); callback.invoke(result);
    }

    @UniJSMethod(uiThread = true)
    public void getStatus(UniJSCallback callback) {
        try { result(callback, TrainingScheduler.permitted(context())); }
        catch (Exception exception) { error(callback, "无法读取训练通知设置"); }
    }

    @UniJSMethod(uiThread = true)
    public void requestExactPermission(UniJSCallback callback) {
        try {
            if (Build.VERSION.SDK_INT >= 31 && !TrainingScheduler.exactPermitted(context())) {
                context().startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + context().getPackageName())).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            }
            // Settings has no permission result callback. Refresh and reconcile on app resume.
            result(callback, TrainingScheduler.exactPermitted(context()));
        } catch (Exception exception) { error(callback, "无法打开准时提醒设置，请在系统设置中允许；普通通知无法保证准时"); }
    }

    @UniJSMethod(uiThread = true)
    public void requestPermission(UniJSCallback callback) {
        try {
            if (permissionCallback != null) { error(callback, "通知授权请求正在进行"); return; }
            if (Build.VERSION.SDK_INT >= 33 && context().checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                if (!(context() instanceof Activity)) { error(callback, "无法打开通知授权界面"); return; }
                permissionCallback = callback;
                PermissionControler.requestPermissions((Activity) context(), new String[]{ Manifest.permission.POST_NOTIFICATIONS }, REQUEST);
            } else result(callback, TrainingScheduler.permitted(context()));
        } catch (Exception exception) { permissionCallback = null; error(callback, "请求训练通知权限失败：" + exception.getMessage()); }
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == REQUEST && permissionCallback != null) {
            UniJSCallback callback = permissionCallback; permissionCallback = null;
            result(callback, TrainingScheduler.permitted(context()));
        }
    }

    @UniJSMethod(uiThread = true)
    public void replace(JSONObject options, UniJSCallback callback) {
        try {
            boolean enabled = options.getBooleanValue("enabled");
            int mask = 0, hour = 0, minute = 0;
            if (enabled) {
                JSONArray weekdays = options.getJSONArray("weekdays");
                if (weekdays == null || weekdays.isEmpty()) throw new IllegalArgumentException("请选择训练星期");
                for (int i = 0; i < weekdays.size(); i++) {
                    int day = weekdays.getIntValue(i);
                    if (day < 1 || day > 7) throw new IllegalArgumentException("训练星期无效");
                    mask |= 1 << (day - 1);
                }
                String time = options.getString("time");
                if (time == null || !time.matches("([01]\\d|2[0-3]):[0-5]\\d")) throw new IllegalArgumentException("提醒时间无效");
                hour = Integer.parseInt(time.substring(0, 2)); minute = Integer.parseInt(time.substring(3, 5));
            }
            // 设置变更先结束试听与旧响铃，再保存新代次并重排未来事件。
            stopPreviewInternal();
            TrainingScheduler.replace(context(), enabled, mask, hour, minute, options.getString("mode"), options.getString("sound"));
            result(callback, true);
        } catch (Exception exception) { error(callback, "系统训练提醒安排失败：" + exception.getMessage()); }
    }

    @UniJSMethod(uiThread = true)
    public void listRingtones(UniJSCallback callback) {
        try {
            RingtoneManager ringtones = new RingtoneManager(context());
            ringtones.setType(RingtoneManager.TYPE_ALARM);
            JSONArray items = new JSONArray();
            Cursor cursor = ringtones.getCursor();
            if (cursor != null) {
                for (int position = 0; position < cursor.getCount(); position++) {
                    if (!cursor.moveToPosition(position)) continue;
                    Uri uri = ringtones.getRingtoneUri(position);
                    if (uri == null) continue;
                    String id = cursor.getString(RingtoneManager.ID_COLUMN_INDEX);
                    String title = cursor.getString(RingtoneManager.TITLE_COLUMN_INDEX);
                    JSONObject item = new JSONObject();
                    item.put("id", id == null ? uri.toString() : id);
                    item.put("title", title == null ? uri.toString() : title);
                    item.put("uri", uri.toString());
                    items.add(item);
                }
                cursor.close();
            }
            JSONObject result = new JSONObject(); result.put("ok", true); result.put("ringtones", items);
            callback.invoke(result);
        } catch (Exception exception) { error(callback, "无法读取系统闹钟铃声：" + exception.getMessage()); }
    }

    @UniJSMethod(uiThread = true)
    public void preview(JSONObject options, UniJSCallback callback) {
        try {
            Uri uri = ringtoneUri(options == null ? null : options.getString("sound"));
            stopPreviewInternal();
            // 试听不保存设置、不安排任务、不消费到时事件；焦点被拒绝或铃声不可用都如实报错。
            boolean started = previewPlayer.start(context(), uri, false, this::stopPreviewInternal);
            if (!started && !uri.equals(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))) {
                started = previewPlayer.start(context(), RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), false, this::stopPreviewInternal);
            }
            if (!started) throw new IllegalStateException("音频焦点被拒绝或铃声无法播放");
            handler.removeCallbacks(previewTimeout);
            handler.postDelayed(previewTimeout, PREVIEW_MILLIS);
            result(callback, true);
        } catch (Exception exception) { error(callback, "无法试听所选铃声：" + exception.getMessage()); }
    }

    @UniJSMethod(uiThread = true)
    public void stopPreview(UniJSCallback callback) {
        try { stopPreviewInternal(); result(callback, true); }
        catch (Exception exception) { error(callback, "停止试听失败"); }
    }

    @UniJSMethod(uiThread = true)
    public void stopRinging(UniJSCallback callback) {
        try { TrainingScheduler.stopRinging(context()); result(callback, true); }
        catch (Exception exception) { error(callback, "停止响铃失败"); }
    }

    private Uri ringtoneUri(String sound) {
        String trimmed = sound == null ? "" : sound.trim();
        if (trimmed.isEmpty()) return TrainingScheduler.ringUri(context());
        try { return Uri.parse(trimmed); } catch (Exception invalid) { return TrainingScheduler.ringUri(context()); }
    }

    private void stopPreviewInternal() {
        handler.removeCallbacks(previewTimeout);
        previewPlayer.stop();
    }
}
