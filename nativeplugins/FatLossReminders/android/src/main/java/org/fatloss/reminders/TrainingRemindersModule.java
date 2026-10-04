package org.fatloss.reminders;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.content.pm.PackageManager;
import android.os.Build;
import android.provider.Settings;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import io.dcloud.common.core.permission.PermissionControler;
import io.dcloud.feature.uniapp.annotation.UniJSMethod;
import io.dcloud.feature.uniapp.bridge.UniJSCallback;
import io.dcloud.feature.uniapp.common.UniModule;

public final class TrainingRemindersModule extends UniModule {
    private static final int REQUEST = 710;
    private UniJSCallback permissionCallback;
    private Context context() { return mUniSDKInstance.getContext(); }
    private void result(UniJSCallback callback, boolean granted) {
        JSONObject result = new JSONObject(); result.put("ok", true); result.put("granted", granted);
        result.put("exact", TrainingScheduler.exactPermitted(context()));
        result.put("notifications", TrainingScheduler.permitted(context()));
        result.put("sound", TrainingScheduler.soundPermitted(context())); callback.invoke(result);
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
    private void error(UniJSCallback callback, String message) {
        JSONObject result = new JSONObject(); result.put("ok", false); result.put("error", message); callback.invoke(result);
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
            TrainingScheduler.replace(context(), enabled, mask, hour, minute);
            result(callback, true);
        } catch (Exception exception) { error(callback, "系统训练提醒安排失败：" + exception.getMessage()); }
    }
}
