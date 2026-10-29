package mx.forte.reloj;

import androidx.annotation.NonNull;
import androidx.wear.protolayout.ActionBuilders;
import androidx.wear.protolayout.ColorBuilders;
import androidx.wear.protolayout.DimensionBuilders;
import androidx.wear.protolayout.LayoutElementBuilders;
import androidx.wear.protolayout.ModifiersBuilders;
import androidx.wear.protolayout.ResourceBuilders;
import androidx.wear.protolayout.TimelineBuilders;
import androidx.wear.tiles.RequestBuilders;
import androidx.wear.tiles.TileBuilders;
import androidx.wear.tiles.TileService;

import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;

/** Mosaico: velocidad, batería, motor y gasolina de un vistazo. Tócalo para abrir la app. */
public class DashTile extends TileService {

    private static final String RES = "1";

    private static LayoutElementBuilders.Text text(String t, float sp, int color, boolean bold) {
        return new LayoutElementBuilders.Text.Builder()
                .setText(t)
                .setFontStyle(new LayoutElementBuilders.FontStyle.Builder()
                        .setSize(DimensionBuilders.sp(sp))
                        .setColor(ColorBuilders.argb(color))
                        .setWeight(bold ? LayoutElementBuilders.FONT_WEIGHT_BOLD : LayoutElementBuilders.FONT_WEIGHT_NORMAL)
                        .build())
                .build();
    }

    private static LayoutElementBuilders.Spacer gap(float dp) {
        return new LayoutElementBuilders.Spacer.Builder().setHeight(DimensionBuilders.dp(dp)).build();
    }

    @NonNull
    @Override
    protected ListenableFuture<TileBuilders.Tile> onTileRequest(@NonNull RequestBuilders.TileRequest req) {
        WatchData.load(this);
        boolean vivo = WatchData.vivo();
        Double speed = WatchData.get("speed"), rpm = WatchData.get("rpm"), cool = WatchData.get("coolant"),
                volt = WatchData.get("volt"), fuel = WatchData.get("fuel");
        final int white = 0xFFFFFFFF, ice = 0xFF8FB0E6, red = 0xFFFF3B45, amber = 0xFFFFB02E, green = 0xFF4BE36D;

        LayoutElementBuilders.Column.Builder col = new LayoutElementBuilders.Column.Builder()
                .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER);
        String a = WatchData.alertaReciente();
        if (a != null) {
            col.addContent(text(a.length() > 28 ? a.substring(0, 27) + "…" : a, 12, red, true)).addContent(gap(4));
        }
        if (vivo) {
            col.addContent(text(WatchData.n(speed, 0), 46, white, true))
                    .addContent(text("km/h · " + WatchData.n(rpm, 0) + " rpm", 13, ice, false));
        } else {
            col.addContent(text("Sin conexión", 18, white, true))
                    .addContent(text("Abre la app del teléfono", 12, ice, false));
        }
        col.addContent(gap(8))
                .addContent(text("Batería " + WatchData.n(volt, 1) + " V", 15,
                        volt == null ? white : volt < 12.2 ? amber : volt >= 13.2 ? green : white, true))
                .addContent(gap(2))
                .addContent(text("Motor " + WatchData.n(cool, 0) + "° · Gas " + WatchData.n(fuel, 0) + "%", 13,
                        (cool != null && cool >= 108) || (fuel != null && fuel < 15) ? red : white, false));

        LayoutElementBuilders.Box root = new LayoutElementBuilders.Box.Builder()
                .setWidth(DimensionBuilders.expand())
                .setHeight(DimensionBuilders.expand())
                .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
                .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
                .setModifiers(new ModifiersBuilders.Modifiers.Builder()
                        .setClickable(new ModifiersBuilders.Clickable.Builder()
                                .setId("abrir")
                                .setOnClick(new ActionBuilders.LaunchAction.Builder()
                                        .setAndroidActivity(new ActionBuilders.AndroidActivity.Builder()
                                                .setPackageName(getPackageName())
                                                .setClassName(WatchActivity.class.getName())
                                                .build())
                                        .build())
                                .build())
                        .build())
                .addContent(col.build())
                .build();

        TileBuilders.Tile tile = new TileBuilders.Tile.Builder()
                .setResourcesVersion(RES)
                .setFreshnessIntervalMillis(vivo ? 15000 : 60000)
                .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(root))
                .build();
        return Futures.immediateFuture(tile);
    }

    @NonNull
    @Override
    protected ListenableFuture<ResourceBuilders.Resources> onTileResourcesRequest(@NonNull RequestBuilders.ResourcesRequest req) {
        return Futures.immediateFuture(new ResourceBuilders.Resources.Builder().setVersion(RES).build());
    }
}
