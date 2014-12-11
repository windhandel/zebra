(function(pkg, Class) {

/**
 * @module ui
 */
var ME = pkg.MouseEvent, KE = pkg.KeyEvent, PO = zebra.util.Position;

/**
 * Text field UI component. The component is designed to enter single line, multi lines or password text.
 * The component implement text field functionality from the scratch. It supports the following features

    - Text selection
    - Redu/Undo actions
    - Native WEB clipboard
    - Basic text navigation
    - Read-only mode

 * @constructor
 * @param {String|zebra.data.TextModel|zebra.ui.TextRender} [txt] a text the text field component
 * has to be filled. The parameter can be a simple string, text model or text render class instance.
 * @param {Integer} [maxCol] a maximal size of entered text. -1 means the size of the edited text
 * has no length limit.
 * @class zebra.ui.TextField
 * @extends zebra.ui.Label
 */
pkg.TextField = Class(pkg.Label, [
    function $prototype() {
        /**
         * Selection color
         * @attribute  selectionColor
         * @type {String}
         * @readOnly
         */
        this.selectionColor = this.curView = this.position = null;

        /**
         * Specify the text field cursor blinking period in milliseconds.
         * -1 means no blinkable cursor
         * @type {Number}
         * @default -1
         * @readOnly
         * @attribute blinkigPeriod
         */
        this.blinkingPeriod = -1;
        this.blinkMe        = true;
        this.blinkMeCounter = 0;

        this.cursorType = pkg.Cursor.TEXT;

        /**
         * Cursor view
         * @attribute curView
         * @type {zebra.ui.View}
         * @readOnly
         */

        /**
         * Indicate if the text field is editable
         * @attribute  isEditable
         * @type {Boolean}
         * @default true
         * @readOnly
         */
        this.canHaveFocus = this.isEditable = true;

        /**
         * Set the specified blinking period of the text field cursor
         * @param {Integer} [period] a text field cursor blinking period (in milliseconds),
         * use -1 to disable cursor blinking. If the argument is not passed the default (500ms)
         * blinking period will be applied.
         * @method setBlinking
         */
        this.setBlinking = function(period) {
            if (arguments.length === 0) {
                period = 500;
            }

            if (period != this.blinkingPeriod) {
                this.blinkingPeriod = period;
                this.repaintCursor();
            }
        };

        this.textUpdated = function(src, b, off, size, startLine, lines){
            if (this.position != null) {
                if (b === true) this.position.inserted(off, size);
                else            this.position.removed(off, size);
            }
        };

        /**
         * Compute a text column and row by the given location.
         * @param  {Integer} x  a x coordinate
         * @param  {Integer} y  a y coordinate
         * @return {Array} a text row and column as an Array object. Fist element
         * of the array is row and the second one is column.
         * @method  getTextRowColAt
         */
        this.getTextRowColAt = function(x,y) {
            var lines = this.view.target.getLines();
            if (x >= 0 && y >= 0 && lines > 0) {
                var lh = this.view.getLineHeight(),
                    li = this.view.getLineIndent(),
                    row = (y < 0) ? 0 : ~~((y + li) / (lh + li)) + ((y + li) % (lh + li) > li ? 1 : 0) -1;

                if (row < lines && row >= 0) {
                    var s    = this.view.getLine(row),
                        pdt  = 1000000,
                        pcol = -1;

                    for(var col = ~~((x / this.view.lineWidth(row)) * s.length); col>=0 && col <= s.length;) {
                        var l  = this.view.font.charsWidth(s, 0, col),
                            dt = Math.abs(l - x);

                        if (dt >= pdt) {
                            return [row, pcol];
                        }

                        pdt  = dt;
                        pcol = col;
                        col += (l > x ? -1: 1);
                    }

                    return[row, s.length];
                }
            }
            return null;
        };

        this.findNextWord = function(t, line, col, d){
            if (line < 0 || line >= t.getLines()) return null;

            var ln = t.getLine(line);
            col += d;
            if (col < 0 && line > 0) return [line - 1, t.getLine(line - 1).length];
            else {
                if (col > ln.length && line < t.getLines() - 1) return [line + 1, 0];
            }

            var b = false;
            for(; col >= 0 && col < ln.length; col += d){
                if (b) {
                    if (d > 0) {
                        if (zebra.util.isLetter(ln[col])) return [line, col];
                    }
                    else {
                        if (!zebra.util.isLetter(ln[col])) return [line, col + 1];
                    }
                }
                else  {
                    b = d > 0 ? !zebra.util.isLetter(ln[col]) : zebra.util.isLetter(ln[col]);
                }
            }
            return (d > 0 ? [line, ln.length ]: [line, 0]);
        };

        // accumulate text model lines into string by the given start and end offsets
        // r     - text view
        // start - start offset
        // end   - end offset
        this.getSubString = function(r,start,end){
            var res = [], sr = start[0], er = end[0], sc = start[1], ec = end[1];
            for(var i = sr; i < er + 1; i++){
                var ln = r.getLine(i);
                if (i != sr) res.push('\n');
                else ln = ln.substring(sc);
                if (i == er) ln = ln.substring(0, ec - ((sr == er) ? sc : 0));
                res.push(ln);
            }
            return res.join('');
        };

        /**
         * Remove selected text
         * @method removeSelected
         */
        this.removeSelected = function(){
            if (this.hasSelection()){
                var start = this.startOff < this.endOff ? this.startOff : this.endOff;
                this.remove(start, (this.startOff > this.endOff ? this.startOff : this.endOff) - start);
                this.clearSelection();
            }
        };

        this.startSelection = function(){
            if (this.startOff < 0 && this.position != null){
                var pos = this.position;
                this.endLine = this.startLine = pos.currentLine;
                this.endCol = this.startCol = pos.currentCol;
                this.endOff = this.startOff = pos.offset;
            }
        };

        this.keyTyped = function(e){
            if (e.isControlPressed() || e.isCmdPressed() || this.isEditable === false ||
                (e.ch == '\n' && zebra.instanceOf(this.view.target, zebra.data.SingleLineTxt)))
            {
                return;
            }

            this.removeSelected();
            this.write(this.position.offset, e.ch);
        };

        this.selectAll_command = function() {
            this.select(0, this.position.metrics.getMaxOffset());
        };

        this.nextWord_command = function(b, d) {
            if (b) this.startSelection();
            var p = this.findNextWord(this.view.target, this.position.currentLine,
                                                        this.position.currentCol, d);
            if (p != null) {
                this.position.setRowCol(p[0], p[1]);
            }
        };

        this.nextPage_command = function(b, d) {
            if (b) this.startSelection();
            this.position.seekLineTo(d == 1 ? PO.DOWN : PO.UP, this.pageSize());
        };

        this.keyPressed = function(e) {
            if (this.isFiltered(e) === false)  {
                var position    = this.position,
                    col         = position.currentCol,
                    isShiftDown = e.isShiftPressed(),
                    line        = position.currentLine,
                    foff        = 1;

                if (isShiftDown && (e.ch == KE.CHAR_UNDEFINED || e.ch == null)) {
                    this.startSelection();
                }

                switch(e.code)
                {
                    case KE.DOWN : position.seekLineTo(PO.DOWN);break;
                    case KE.UP   : position.seekLineTo(PO.UP);break;
                    case KE.LEFT : foff = -1;
                    case KE.RIGHT:
                        if (e.isControlPressed() === false && e.isCmdPressed() === false) {
                            position.seek(foff);
                        }
                        break;
                    case KE.END:
                        if (e.isControlPressed()) {
                            position.seekLineTo(PO.DOWN, position.metrics.getLines() - line - 1);
                        }
                        else position.seekLineTo(PO.END);
                        break;
                    case KE.HOME:
                        if (e.isControlPressed()) position.seekLineTo(PO.UP, line);
                        else position.seekLineTo(PO.BEG);
                        break;
                    case KE.DELETE:
                        if (this.hasSelection() && this.isEditable === true) {
                            this.removeSelected();
                        }
                        else {
                            if (this.isEditable === true) this.remove(position.offset, 1);
                        } break;
                    case KE.BSPACE:
                        if (this.isEditable === true) {
                            if (this.hasSelection()) this.removeSelected();
                            else {
                                if (this.isEditable === true && position.offset > 0){
                                    position.seek(-1);
                                    this.remove(position.offset, 1);
                                }
                            }
                        } break;
                    default: return ;
                }

                if (isShiftDown === false) {
                    this.clearSelection();
                }
            }
        };

        /**
         * Test if the given key pressed event has to be processed
         * @protected
         * @param  {zebra.ui.KeyEvent} e a key event
         * @return {Boolean} true if the given key pressed event doesn't
         * have be processed
         * @method isFiltered
         */
        this.isFiltered = function(e){
            var code = e.code;
            return code == KE.SHIFT || code == KE.CTRL ||
                   code == KE.TAB   || code == KE.ALT  ||
                   (e.mask & KE.M_ALT) > 0;
        };

        /**
         * Remove the specified part of edited text
         * @param  {Integer} pos  a start position of a removed text
         * @param  {Integer} size a size of removed text
         * @method remove
         */
        this.remove = function (pos,size){
            if (this.isEditable === true) {
                var position = this.position;
                if (pos >= 0 && (pos + size) <= position.metrics.getMaxOffset()) {
                    if (size < 10000) {
                        this.historyPos = (this.historyPos + 1) % this.history.length;
                        this.history[this.historyPos] = [-1, pos, this.getValue().substring(pos, pos+size)];
                        if (this.undoCounter < this.history.length) this.undoCounter++;
                    }

                    var pl = position.metrics.getLines(), old = position.offset;
                    this.view.target.remove(pos, size);
                    if (position.metrics.getLines() != pl || old == pos) {
                        this.repaint();
                    }
                }
            }
        };

        /**
         * Insert the specified text into the edited text at the given position
         * @param  {Integer} pos  a start position of a removed text
         * @param  {String} s a text to be inserted
         * @method write
         */
        this.write = function (pos,s){
            if (this.isEditable === true) {
                if (s.length < 10000) {
                    this.historyPos = (this.historyPos + 1) % this.history.length;
                    this.history[this.historyPos] = [1, pos, s.length];
                    if (this.undoCounter < this.history.length) this.undoCounter++;
                }

                var old = this.position.offset,
                    m   = this.view.target,
                    pl  = m.getLines();

                m.write(s, pos);
                if (m.getLines() != pl || this.position.offset == old) {
                    this.repaint();
                }
            }
        };

        this.recalc = function() {
            var r = this.view;
            if (this.position.offset >= 0) {
                this.curX = r.font.charsWidth(r.getLine(this.position.currentLine),
                                              0,
                                              this.position.currentCol) + this.getLeft();

                this.curY = this.position.currentLine * (r.getLineHeight() + r.getLineIndent()) +
                            this.getTop();
            }
            this.curH = r.getLineHeight() - 1;
        };

        this.catchScrolled = function(psx,psy){
            this.repaint();
        };

        /**
         * Draw the text field cursor
         * @protected
         * @param  {2DContext} g  a 2D contextnn
         * @method drawCursor
         */
        this.drawCursor = function (g) {
            if (this.position.offset >= 0 &&
                this.curView != null      &&
                this.blinkMe              &&
                (this.hasFocus() || this.$forceToShow == true)) // TODO: $forceToShow is akward solution
            {
                this.curView.paint(g, this.curX, this.curY,
                                      this.curW, this.curH, this);
            }
        };

        this.mouseDragStarted = function (e){
            if (e.mask == ME.LEFT_BUTTON && this.position.metrics.getMaxOffset() > 0) {
                this.startSelection();
            }
        };

        this.mouseDragEnded =function (e){
            if (e.mask == ME.LEFT_BUTTON && this.hasSelection() === false) {
                this.clearSelection();
            }
        };

        this.mouseDragged = function (e){
            if (e.mask == ME.LEFT_BUTTON){
                var p = this.getTextRowColAt(e.x - this.scrollManager.getSX(),
                                             e.y - this.scrollManager.getSY());
                if (p != null) this.position.setRowCol(p[0], p[1]);
            }
        };

        /**
         * Select the specified part of the edited text
         * @param  {Integer} startOffset a start position of a selected text
         * @param  {Integer} endOffset  an end position of a selected text
         * @method select
         */
        this.select = function (startOffset,endOffset){
            if (endOffset < startOffset ||
                startOffset < 0 ||
                endOffset > this.position.metrics.getMaxOffset())
            {
                throw new Error("Invalid selection offsets");
            }

            if (this.startOff != startOffset || endOffset != this.endOff){
                if (startOffset == endOffset) this.clearSelection();
                else {
                    this.startOff = startOffset;
                    var p = this.position.getPointByOffset(startOffset);
                    this.startLine = p[0];
                    this.startCol = p[1];
                    this.endOff = endOffset;
                    p = this.position.getPointByOffset(endOffset);
                    this.endLine = p[0];
                    this.endCol = p[1];
                    this.repaint();
                }
            }
        };

        /**
         * Test if the text field has a selected text
         * @return {Boolean} true if the text field has a selected text
         * @method hasSelection
         */
        this.hasSelection = function () {
            return this.startOff != this.endOff;
        };

        this.posChanged = function (target,po,pl,pc){
            this.recalc();
            var position = this.position;
            if (position.offset >= 0) {

                this.blinkMeCounter = 0;
                this.blinkMe = true;

                var lineHeight = this.view.getLineHeight(),
                    top        = this.getTop();

                this.scrollManager.makeVisible(this.curX, this.curY, this.curW, lineHeight);
                if (pl >= 0) {
                    if (this.startOff >= 0){
                        this.endLine = position.currentLine;
                        this.endCol = position.currentCol;
                        this.endOff = position.offset;
                    }

                    var minUpdatedLine = pl < position.currentLine ? pl : position.currentLine,
                        li             = this.view.getLineIndent(),
                        bottom         = this.getBottom(),
                        left           = this.getLeft(),
                        y1             = lineHeight * minUpdatedLine + minUpdatedLine * li +
                                         top + this.scrollManager.getSY();

                    if (y1 < top) y1 = top;

                    if (y1 < this.height - bottom){
                        var h = ((pl > position.currentLine ? pl
                                                            : position.currentLine) - minUpdatedLine + 1) * (lineHeight + li);
                        if (y1 + h > this.height - bottom) {
                            h = this.height - bottom - y1;
                        }
                        this.repaint(left, y1, this.width - left - this.getRight(), h);
                    }
                }
                else {
                    this.repaint();
                }
            }
        };

        this.paintOnTop = function(g) {
            if (this.hint && this.hasFocus() === false && this.getValue() == '') {
                this.hint.paint(g, this.getLeft(),
                                   this.height - this.getBottom() - this.hint.getLineHeight(),
                                this.width, this.height, this);
            }
        };

        /**
         * Set the specified hint text to be drawn with the given font and color.
         * The hint is not-editable text that is shown in empty text field to help
         * a user to understand which input the text field expects.
         * @param {String} hint a hint text
         * @param {String|zebra.ui.Font} font a font
         * @param {String} color a hint color
         * @method setHint
         */
        this.setHint = function(hint, font, color) {
            this.hint = hint;
            if (hint != null && zebra.instanceOf(hint, pkg.View) === false) {
                this.hint = new pkg.StringRender(hint);
                font  = font  ? font  : pkg.TextField.hintFont;
                color = color ? color : pkg.TextField.hintColor;
                this.hint.setColor(color);
                this.hint.setFont(font);
            }
            this.repaint();
            return this.hint;
        };

        this.undo_command = function() {
            if (this.undoCounter > 0) {
                var h = this.history[this.historyPos];

                this.historyPos--;
                if (h[0] == 1) this.remove(h[1], h[2]);
                else           this.write (h[1], h[2]);

                this.undoCounter -= 2;
                this.redoCounter++;

                this.historyPos--;
                if (this.historyPos < 0) this.historyPos = this.history.length - 1;

                this.repaint();
            }
        };

        this.redo_command = function() {
            if (this.redoCounter > 0) {
                var h = this.history[(this.historyPos + 1) % this.history.length];
                if (h[0] == 1) this.remove(h[1], h[2]);
                else           this.write (h[1], h[2]);
                this.redoCounter--;
                this.repaint();
            }
        };

        /**
         * Get a starting position (row and column) of a selected text
         * @return {Array} a position of a selected text. First element
         * of is a row and second column of selected text. null if
         * there is no any selected text
         * @method getStartSelection
         */
        this.getStartSelection = function(){
            return this.startOff != this.endOff ? ((this.startOff < this.endOff) ? [this.startLine, this.startCol]
                                                                                 : [this.endLine, this.endCol]) : null;
        };

        /**
         * Get an ending position (row and column) of a selected text
         * @return {Array} a position of a selected text. First element
         * of is a row and second column of selected text. null if
         * there is no any selected text
         * @method getEndSelection
         */
        this.getEndSelection = function(){
            return this.startOff != this.endOff ? ((this.startOff < this.endOff) ? [this.endLine, this.endCol]
                                                                                 : [this.startLine, this.startCol]) : null;
        };

        /**
         * Get a selected text
         * @return {String} a selected text
         * @method getSelectedText
         */
        this.getSelectedText = function(){
            return this.startOff != this.endOff ? this.getSubString(this.view,
                                                                    this.getStartSelection(),
                                                                    this.getEndSelection())
                                                : null;
        };

        this.focusGained = function (e){
            if (this.position.offset < 0) {
                this.position.setOffset(0);
            }
            else {
                if (this.hint != null) this.repaint();
                else {
                    if (this.isEditable === true) {
                        this.repaintCursor();
                    }
                }
            }

            if (this.isEditable === true && this.blinkingPeriod > 0) {
                this.blinkMeCounter = 0;
                this.blinkMe = true;
                this.blinkTask = zebra.util.task(this).run(~~(this.blinkingPeriod/3),
                                                           ~~(this.blinkingPeriod/3));
            }
        };

        this.focusLost = function(e){
            if (this.isEditable === true) {
                if (this.hint) this.repaint();
                else {
                    this.repaintCursor();
                }

                if (this.blinkingPeriod > 0) {
                    if (this.blinkTask != null) {
                        this.blinkTask.shutdown();
                        this.blinkTask = null;
                    }
                    this.blinkMe = true;
                }
            }
        };

        this.repaintCursor = function() {
            if (this.curX > 0 && this.curW > 0 && this.curH > 0) {
                this.repaint(this.curX + this.scrollManager.getSX(),
                             this.curY + this.scrollManager.getSY(),
                             this.curW, this.curH);
            }
        };

        this.run = function() {
            this.blinkMeCounter = (this.blinkMeCounter + 1) % 3;

            if (this.blinkMeCounter === 0) {
                this.blinkMe = !this.blinkMe;
                this.repaintCursor();
            }
        };

        /**
         * Clear a text selection.
         * @method clearSelection
         */
        this.clearSelection = function (){
            if (this.startOff >= 0){
                var b = this.hasSelection();
                this.endOff = this.startOff =  -1;
                if (b) this.repaint();
            }
        };

        this.pageSize = function (){
            var height = this.height - this.getTop() - this.getBottom(),
                indent = this.view.getLineIndent(),
                textHeight = this.view.getLineHeight();

            return (((height + indent) / (textHeight + indent) + 0.5) | 0) +
                   (((height + indent) % (textHeight + indent) > indent) ? 1 : 0);
        };

        this.clipPaste = function(txt){
            if (txt != null){
                this.removeSelected();
                this.write(this.position.offset, txt);
            }
        };

        this.clipCopy = function() {
            return this.getSelectedText();
        };

        this.cut = function() {
            var t = this.getSelectedText();
            if (this.isEditable === true) this.removeSelected();
            return t;
        };

        /**
         * Set the specified cursor position controller
         * @param {zebra.util.Position} p a position controller
         * @method setPosition
         */
        this.setPosition = function (p){
            if (this.position != p){
                if (this.position != null){
                    this.position.unbind(this);
                }
                this.position = p;
                if (this.position != null) {
                this.position.bind(this);
                }
                this.invalidate();
            }
        };

        /**
         * Set the cursor view. The view defines rendering of the text field
         * cursor.
         * @param {zebra.ui.View} v a cursor view
         * @method setCursorView
         */
        this.setCursorView = function (v){
            // !!!
            // cursor size should be set by property
            this.curW = 1;
            this.curView = pkg.$view(v);
            //this.curW = this.curView != null ? this.curView.getPreferredSize().width : 1;
            this.vrp();
        };

        /**
         * Adjust the size of the text field component to be enough to place the given
         * number of rows and columns.
         * @param {Integer} r a row of the text the height of the text field has to be adjusted
         * @param {Integer} c a column of the text the width of the text field has to be adjusted
         * @method setPSByRowsCols
         */
        this.setPSByRowsCols = function (r,c){
            var tr = this.view,
                w  = (c > 0) ? (tr.font.stringWidth("W") * c)
                             : this.psWidth,
                h  = (r > 0) ? (r * tr.getLineHeight() + (r - 1) * tr.getLineIndent())
                             : this.psHeight;
            this.setPreferredSize(w, h);
        };

        /**
         * Control the text field editable state
         * @param {Boolean} b true to make the text field editable
         * @method setEditable
         */
        this.setEditable = function (b){
            if (b != this.isEditable){
                this.isEditable = b;
                if (b && this.blinkingPeriod > 0 && this.hasFocus()) {
                    if (this.blinkTask != null) this.blinkTask.shutdown();
                    this.blinkMe = true;
                }
                this.vrp();
            }
        };

        this.mousePressed = function(e){
            if (e.isActionMask()) {
                if (e.clicks > 1) {
                    this.select(0, this.position.metrics.getMaxOffset());
                }
                else {
                    if ((e.mask & KE.M_SHIFT) > 0) this.startSelection();
                    else this.clearSelection();
                    var p = this.getTextRowColAt(e.x - this.scrollManager.getSX() - this.getLeft(),
                                                 e.y - this.scrollManager.getSY() - this.getTop());
                    if (p != null) this.position.setRowCol(p[0], p[1]);
                }
            }
        };

        /**
         * Set selection color
         * @param {String} c a selection color
         * @method setSelectionColor
         */
        this.setSelectionColor = function (c){
            if (c != this.selectionColor){
                this.selectionColor = c;
                if (this.hasSelection()) this.repaint();
            }
        };

        this.calcPreferredSize = function (t) {
            var ps = this.view.getPreferredSize();
            ps.width += this.curW;
            return ps;
        };

        //!!! to maximize optimize performance the method duplicates part of ViewPan.paint() code
        this.paint = function(g){
            var sx = this.scrollManager.getSX(),
                sy = this.scrollManager.getSY(),
                l  = this.getLeft(),
                t  = this.getTop();

            try {
                g.translate(sx, sy);
                //!!! this code can be found in ViewPan.paint()

                this.view.paint(g, l, t,
                                this.width  - l - this.getRight(),
                                this.height - t - this.getBottom(), this);
                this.drawCursor(g);

            }
            catch(e) {
                g.translate( -sx,  -sy);
                throw e;
            }
            g.translate( -sx,  -sy);
        };
    },

    function () {
        this.$this("");
    },

    function(s, maxCol){
        var b = zebra.isNumber(maxCol);
        this.$this(b ? new zebra.data.SingleLineTxt(s, maxCol)
                     : (maxCol ? new zebra.data.Text(s) : s));
        if (b && maxCol > 0) this.setPSByRowsCols(-1, maxCol);
    },

    function (render){
        if (zebra.isString(render)) {
            render = new pkg.TextRender(new zebra.data.SingleLineTxt(render));
        }
        else {
            if (zebra.instanceOf(render, zebra.data.TextModel)) {
                render = new pkg.TextRender(render);
            }
        }
        this.startLine = this.startCol = this.endLine = this.endCol = this.curX = 0;
        this.startOff = this.endOff = -1;
        this.history = Array(100);
        this.historyPos = -1;
        this.redoCounter = this.undoCounter = this.curY = this.curW = this.curH = 0;

        this.$super(render);
        this.scrollManager = new pkg.ScrollManager(this);
    },

    function setView(v){
        if (v != this.view) {
            if (this.view != null && this.view.target != null) {
                this.view.target.unbind(this);
            }

            this.$super(v);
            if (this.position == null) {
                this.setPosition(new PO(this.view));
            }
            else {
                this.position.setMetric(this.view);
            }

            if (this.view != null && this.view.target != null) {
                this.view.target.bind(this);
            }
        }
    },

    /**
     * Set the text content of the text field component
     * @param {String} s a text the text field component has to be filled
     * @method setValue
     */
    function setValue(s) {
        var txt = this.getValue();
        if (txt != s){
            if (this.position != null) {
                this.position.setOffset(0);
            }
            this.scrollManager.scrollTo(0, 0);
            this.$super(s);
        }
    },

    function setEnabled(b){
        this.clearSelection();
        this.$super(b);
    }
]);

/**
 * Text area UI component. The UI component to render multi-lines text.
 * @class zebra.ui.TextArea
 * @constructor
 * @param {String} [txt] a text
 * @extends zebra.ui.TextField
 */
pkg.TextArea = Class(pkg.TextField, [
    function() {
        this.$this("");
    },

    function(txt) {
        this.$super(new zebra.data.Text(txt));
    }
]);

/**
 * Password text field.
 * @class zebra.ui.PassTextField
 * @param {String} txt password text
 * @param {Integer} [maxSize] maximal size
 * @param {Boolean} [showLast] indicates if last typed character should
 * not be disguised with a star character
 * @extends zebra.ui.TextField
 */
pkg.PassTextField = Class(pkg.TextField, [
    function(txt) {
        this.$this(txt, -1);
    },

    function(txt, size) {
        this.$this(txt, size, false);
    },

    function(txt, size, showLast) {
        var pt = new pkg.PasswordText(new zebra.data.SingleLineTxt(txt, size));
        pt.showLast = showLast;
        this.$super(pt);
    }
]);

/**
 * @for
 */

})(zebra("ui"), zebra.Class);