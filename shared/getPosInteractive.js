function getPosInteractive(promptText) {
    let gotPos = false;
    //pos[0] wide, pos[1] high
    let pos = [0, 0];
    //Coordinates of the interior of the floating window
    let windowPos = [0, 0];
    let fingerReleased = false;
    let confirmed = false;
    let fullScreenWindowRequestClose = false;
    let canvasDebugCounter = 0;
    let deviceWidth = context.getResources().getDisplayMetrics().widthPixels;
    let deviceHeight = context.getResources().getDisplayMetrics().heightPixels;

    console.log("getPosInteractive(): " + promptText);
    // Prompt and confirm button box
    let confirmWindow = floaty.rawWindow(
        <frame gravity="left|top">
            <vertical bg="#7fffff7f">
                <text id="promptText" text="" textSize="14sp" />
                <button id="confirmBtn" style="Widget.AppCompat.Button.Colored" text="确定" />
                <button id="cancelBtn" style="Widget.AppCompat.Button.Colored" text="取消" />
            </vertical>
        </frame>
    );
    confirmWindow.setPosition(deviceWidth / 3, 0);
    confirmWindow.setTouchable(true);

    let fullScreenWindow = floaty.rawWindow(<canvas id="canv" w="*" h="*" />);
    fullScreenWindow.setTouchable(true);
    fullScreenWindow.setSize(-1, -1);
    fullScreenWindow.canv.setOnTouchListener(function (v, evt) {
        if (evt.getAction() == evt.ACTION_DOWN || evt.getAction() == evt.ACTION_MOVE) {
            gotPos = true;
            pos = [parseInt(evt.getRawX().toFixed(0)), parseInt(evt.getRawY().toFixed(0))];
            windowPos = [parseInt(evt.getX().toFixed(0)), parseInt(evt.getY().toFixed(0))];
        }
        if (evt.getAction() == evt.ACTION_UP) {
            fingerReleased = true;
        }
        return true;
    });
    fullScreenWindow.canv.on("draw", function (canvas) {
        const Color = android.graphics.Color;
        const Paint = android.graphics.Paint;
        const PorterDuff = android.graphics.PorterDuff;
        const w = canvas.getWidth();
        const h = canvas.getHeight();
        const centerCircleRadius = 10;
        let paint = new Paint();
        if (canvasDebugCounter != -1 && canvasDebugCounter < 60) {
            canvasDebugCounter++;
        } else if (canvasDebugCounter == 60) {
            console.log("canvas [长,短] = [" + w + "," + h + "]");
            console.log("device [长,短] = [" + deviceWidth + "," + deviceHeight + "]");
            canvasDebugCounter = -1;
        }

        //Gray background
        canvas.drawColor(Color.parseColor("#3f000000"), PorterDuff.Mode.SRC);
        if (gotPos) {
            //Draw a cross location line
            paint.setStrokeWidth(2);
            paint.setARGB(255, 255, 255, 255);
            paint.setStyle(Paint.Style.STROKE);
            canvas.drawLine(0, windowPos[1], w, windowPos[1], paint);
            canvas.drawLine(windowPos[0], 0, windowPos[0], h, paint);

            //Draw a hollow circle in the center
            paint.setStyle(Paint.Style.STROKE);
            canvas.drawCircle(windowPos[0], windowPos[1], centerCircleRadius, paint);
        }
        if (fullScreenWindowRequestClose)
            sleep(1000);
    });


    ui.run(() => {
        confirmWindow.promptText.setText("Please click" + promptText);
        confirmWindow.confirmBtn.click(() => {
            confirmed = true;
        });
        confirmWindow.cancelBtn.click(() => {
            fingerReleased = false;
            gotPos = false;
            fullScreenWindow.setTouchable(true);
        });
    });

    while (!confirmed) {
        sleep(100);
        if (fingerReleased) {
            fullScreenWindow.setTouchable(false);
        }

        ui.run(function () {
            if (!gotPos) {
                confirmWindow.promptText.setText("Please click" + promptText);
            } else if (!fingerReleased) {
                confirmWindow.promptText.setText("Current coordinates:" + pos.toString());
            } else {
                confirmWindow.promptText.setText("Current coordinates:" + pos.toString() + ", Click 'OK' to finish, click 'Cancel' to re-acquire");
            }
        });
    }

    fullScreenWindowRequestClose = true;
    sleep(100);
    fullScreenWindow.close();
    confirmWindow.close();

    console.log("End getPosInteractive(): " + pos.toString());

    return {
        "x": pos[0],
        "y": pos[1]
    }
}

module.exports = getPosInteractive;
