( function( CP ) {
    "use strict";

    /*
      Базовый класс для таблиц

      параметры:
         stor   --- CP.ObjectStorage.SimpleObjectStorage
         filter --- функция фильтровки объектов из CP.ObjectStorage.SimpleObjectStorage,
                    применяется при каждой перерисовки таблицы

         columns --- массив названий колонок. Формат:
             name     --- локализованное имя
             key      --- поле объекта из которого брать значение для колонки
             view     --- function для отображения поля (по умолчанию значение как в объекте)
             body_cls --- класс ячейки (будет выставлен в class атрибуте у td элемента)


         table_head_cls       --- класс заголовка таблицы (default: cp_table_header)
         table_head_row_cls   --- класс строки заголовка таблицы (default: cp_table_header)
         table_body_row_cls   --- класс строки тела таблицы (default: cp_table_data)
                                  (может быть строкой или функцией)
         table_body_row_title --- title строки тела таблицы (может быть строкой или функцией)
         table_default_cls    --- класс тела таблицы (default: cp_table cp_simple_table)
         wrapper_cls          --- класс div'а в котором будет таблица

         show_on_empty --- отображаемое значение, если columns.view == null,
                           по умолчанию пустая строка


      Методы:
        rebuild_table_body --- перерисовать тело таблицы
        rebuild_table      --- перерисовать таблицу целиком
        get_row            --- получить дом узел на строку с id elem_id
        get_$row           --- аналогично get_row только jQuery
        remove_row         --- удалить строку с elem_id
        change_row         --- изменить содержимое строки
        get_stor           --- получить stor
        add_row            --- добавить элемент
        get_$dom           --- получить jQuery ссылку на таблицу
        get_dom            --- получить DOM ссылку на таблицу
     */

    class ObjectTableBase extends CP.UI.Forms.Component {
        constructor( p ) {
            super( p );
            this._stor = p.stor;
            this._id_field = p.stor.id_field ?? p.stor.get_id_field();
            this._cls = p.cls || '';

            this.filter = p.filter;

            this._columns = p.columns;

            this._table_head_cls = p.table_head_cls || 'cp_table_header';
            this._table_head_row_cls = p.table_head_row_cls || 'cp_table_header';
            this._table_body_row_cls = p.table_body_row_cls || 'cp_table_body_row';
            this._table_body_row_title = p.table_body_row_title || '';
            this._table_default_cls = p.table_default_cls || 'cp_table cp_simple_table';
            this._table_body_cls  = p.table_body_cls || 'table_body_cls';

            this._localize_value = this._real_localize_value;
            this._show_on_empty = p.show_on_empty ?? '-';

            this._observer = new CP.UserEventsObserver( null, [ 'elem_id' ] );
            this._observer.add_event( 'on_cmd_click', this._execute_cmd_events, this );

            this.get_col_view_name = this._get_col_view_name;

            this._columns.forEach( col => col.view = col.view || R.prop( col.key ) );

            this._table = null;
            this._$table = null;

            this._$body = null; //tbody
            this._$head = null; //thead
            this._$cols = null; //colgroup

            this._set_events();
        }

        get id_field() {
            return this._id_field;
        }

        get stor() {
            return this._stor;
        }

        _set_events() {
            this._stor.add_event( 'add', this.add_row, this );
            this._stor.add_event( 'change', this.change_row, this );
            this._stor.add_event( 'remove', this.remove_row, this );
            this._stor.add_event( 'loaded', this.rebuild_table_body, this, 'load' );
            this._stor.add_event( 'filter', this.rebuild_table_body, this, 'filter' );
            this._stor.add_event( 'after_clean', this.rebuild_table_body, this, 'load' );
            this._stor.add_event( 'updated', this.rebuild_table_body, this, 'update' );

            this._stor.add_event( 'data_sorted', this.rebuild_table_body, this, 'data_sorted' );
        }

        _init() {
            this._build_dom();
            this._observer.set_dom( this._$dom );

            this._build_body();

            this.call_events( 'dom_ready', this._dom );
        }

        _build_dom() {
            this._dom = document.createElement( 'div' );
            this._dom.className = 'cp_ui_table ' + ( this._params.wrapper_cls || '' );
            this._$dom = $( this._dom );
        }

        rebuild_table() {
            this._rebuild_table();
            this.call_events( 'rebuilded' );
        }

        _rebuild_table() {
            if( !this._table ) {
                return;
            }

            this._disabled_ids = {};

            this._$table.remove();
            this._build_body();
            this._$dom.append( this._$table );
        }

        _build_body() {
            const html = '<table class="' + this._table_default_cls + ' ' + this._cls + '">' +
                this._build_table_innerhtml() +
                '</table>';

            this._$table = $( html );
            this._table = this._$table[ 0 ];

            this._$body = this._$table.find( 'tbody' );
            this._$head = this._$table.find( 'thead' );
            this._$cols = this._$table.find( 'colgroup' );

            this._dom.appendChild( this._table );

            return this._table;
        }

        _build_table_innerhtml() {
            return this._build_table_head() +
               ' <tbody class="' + this._table_body_cls + '">' +
                this._build_tbody() +
                '</tbody>';
        }

        get_row( elem_id ) {
            return this.get_$row( elem_id )[ 0 ];
        }

        get_$row( elem_id ) {
            return $( `tr[elem_id="${elem_id}"]`, this._$body );
        }

        _build_cols_elems() {
            const columns = this._columns;
            let html = '<colgroup>';

            for( let i = 0, l = columns.length; i < l; i++ ) {
                const col = columns[ i ];
                const key = `data-key="${col.key}"`;

                let style = '';
                let cls = '';
                let width = '';

                if( 'width' in col ) {
                    width = 'width="' + col.width + '"';
                }
                if( 'hidden' in col && col.hidden ) {
                    style += 'display: none;';
                }

                if( style ) {
                    style = 'style="' + style + '"';
                }

                if( 'cls' in col ) {
                    cls = "class='" + col.cls + "'";
                }

                html += `<col ${key} ${style} ${cls} ${width}/>`;
            }

            return html + '</colgroup>\n';
        }

        _build_table_head_row() {
            let html = '<tr class=' + this._table_head_row_cls + '>';
            html += this._get_head_cells();
            html += '</tr>';
            return html;
        }

        _get_head_cells() {
            let html = '';

            const cols = this._columns;

            let j = 0;

            for( let i = 0, l = cols.length; i < l; i++ ) {
                const column = cols[ i ];
                let style = '';
                let cls = '';

                if( 'hidden' in column && column.hidden ) {
                    style = 'display: none;';
                }

                if( 'style' in column && column.style ) {
                    style += column.style;
                }

                if( style ) {
                    style = `style="${style}"`;
                }

                if( 'head_cls' in column && column.head_cls ) {
                    cls = `class="${column.head_cls}"`;
                }

                const name = this.get_col_view_name( column );
                html += `<td ${cls} ${style}>${name}</td>`;
            }

            return html;
        }

        _get_col_view_name( column ) {
            return LOC( column.name );
        }

        _build_row( elem ) {
            const id = elem[ this._id_field ];

            let cls;
            if( typeof this._table_body_row_cls === 'string' ) {
                cls = 'cp_table_data ' + ( this._table_body_row_cls || '' );
            } else {
                cls = 'cp_table_data ' + ( this._table_body_row_cls( elem, id ) || '' );
            }

            let title = '';
            if( typeof this._table_body_row_title === "string" ) {
                title = `title="${this._table_body_row_title}"`;
            } else if( typeof this._table_body_row_title === 'function' ) {
                title = this._table_body_row_title( elem, id );
                title = title ? `title="${title}"` : '';
            }

            let html = `<tr class="${cls}" ${title} elem_id="${id}">`;

            html += this._get_row_cells( {}, elem );

            return html + '</tr>';
        }

        _get_row_cells( attr, elem ) {
            let html = '';

            const cols = this._columns;
            for( let i = 0, l = cols.length; i < l; i++ ) {
                const column = cols[ i ];
                if( column.hidden || this._skip_cell?.( column, elem ) ) {
                    continue;
                }

                let cls = '';
                if( column.body_cls ) {
                    const { body_cls } = column;
                    cls = typeof body_cls !== 'function' ? body_cls : body_cls( elem );
                }
                if( 'type' in column ) {
                    cls += ' cp_col_' + column.type;
                }

                cls = cls.trim();

                const td_cls = cls ? " class='" + cls + "'" : '';

                const attrs = this._get_cell_attrs( column, elem );

                let data = this._localize_value( column.view( elem ) );

                html += `<td ${td_cls} ${attrs}>${data}</td>`;

            }

            return html;
        }

        _get_cell_attrs( column, elem ) {
            let attrs = {};
            let has_attrs = false;
            if( column.cell_attrs ) {
                const { cell_attrs: c_attrs } = column;
                const col_attrs = typeof c_attrs !== 'function' ? c_attrs : c_attrs( column, elem );
                if( col_attrs ) {
                    attrs = Object.assign( attrs, col_attrs );
                }

                has_attrs = true;
            }

            if( elem.cell_attrs ) {
                const { cell_attrs: e_attrs } = elem;
                const el_attrs = typeof e_attrs !== 'function' ? e_attrs : e_attrs( column, elem );
                if( el_attrs ) {
                    attrs = Object.assign( attrs, el_attrs );
                }

                has_attrs = true;
            }

            attrs.toString = function() {
                if( !has_attrs ) {
                    return '';
                }
                return Object.entries( this )
                    .reduce( ( acc, [ key, value ] ) => {
                        return key !== 'toString' ? `${acc} ${key}="${value}"` : acc;
                    }, '' );
            };

            return attrs;
        }

        _skip_cell( column, elem ) {
            return column.skip_cell?.( column, elem ) || elem.skip_cell?.( column, elem );
        }

        _real_localize_value( value ) {
            return value != null ? LOC( value ) : this._show_on_empty;
        }

        _execute_cmd_events( p ) {
            p.table = this;
            if( p.elem_id == null ) {
                let target = p.target;
                while( target && ( target.nodeName !== 'TR' ) ) {
                    target = target.parentElement;
                }
                if( !target ) {
                    return;
                }
                p.elem_id = target.getAttribute( 'elem_id' );
            }

            this.call_events( p.cmd_name, p );
        }

        remove_row( elem_id ) {
            const $row = this.get_$row( elem_id );
            this.call_events( 'before_remove_row', $row );
            $row.remove();
        }


        change_row( new_elem ) {
            const id = new_elem[ this._id_field ];
            const row = this.get_row( id );

            if( !row ) {
                return;
            }

            if( typeof this._table_body_row_cls === 'function' ) {
                let cls = 'cp_table_data ' + ( this._table_body_row_cls( new_elem, id ) || '' );
                row.className = cls;
            }

            if( typeof this._table_body_row_title === 'function' ) {
                let title = this._table_body_row_title( new_elem, id );
                row.setAttribute( 'title', title );
            }

            let i = 0;

            const cols = this._columns;
            for( let j = 0, l = cols.length; j < l; j++ ) {
                const column = cols[ j ];

                if( 'hidden' in column && column.hidden ) {
                    continue;
                }

                if( column.update_view ) {
                    column.update_view( column, new_elem, row.cells[ i ] );
                } else {
                    row.cells[ i ].innerHTML = this._localize_value( column.view( new_elem ) );
                }

                i++;
            }

        }

        _build_tbody() {
            this.call_events( 'before_build_tbody' );
            let html = '';
            const elems = this.get_rows_data();

            const len = elems.length;
            for( let i = 0; i < len; i++ ) {
                html += this._build_row( elems[ i ] );
            }

            return html;
        }

        get_stor() {
            return this._stor;
        }

        get_rows_data() {
            const elems = this._stor.get_all();

            return this.filter ? elems.filter( this.filter ) : elems;
        }


        rebuild_table_body( ev ) {
            if( this._$table ) {
                const body = this._build_tbody();
                try {
                    this._$body[ 0 ].innerHTML = body;
                } catch( e ) { //IE
                    this._$body.html( body );
                }
                this.call_events( 'rebuilded' );
            }
        }

        _build_table_head() {
            return this._build_cols_elems() + '<thead class=' + this._table_head_cls + '>' +
                '   ' + this._build_table_head_row() +
                '   </thead>';
        }

        add_row( new_elem ) {
            if( this.filter && !this.filter( new_elem ) ) {
                return false;
            }
            this._$body.append( this._build_row( new_elem ) );
        }

        destroy() {
            this.call_events( 'destroy' );

            const events = [ 'add', 'change', 'remove', 'loaded', 'updated', 'after_clean' ];
            for( let i = 0, l = events.length; i < l; i++ ) {
                this._stor.remove_events( events[ i ], this );
            }

            this.filter = null;

            if( this._observer ) {
                this._observer.destroy();
            }
            this.m_events = {};
            super.destroy( this );
        }

    }

    CP.UI.ObjectTableBase = ObjectTableBase;
    CP.UI.ObjectTable = ObjectTableBase;
}( CP ) );
