(function (CP) {
    'use strict';

    class CarListModule {
        constructor() {
            this._table = null;
            this._storage = null;
        }

        init( p ) {
            this._init_storage();
            this._init_table();
            this._load_data();

            this._table.draw( p.container );
        }

        _init_storage() {
            this._storage = new CP.ObjectStorage.SimpleObjectStorage();
        }

        _init_table() {
            this._table = new CP.UI.ObjectTable(
                {
                    stor: this._storage,
                    columns: [
                        {
                            name: 'Рег. Номер',
                            key: 'reg_number'
                        },
                        {
                            name: 'Номер БУ',
                            key: 'device'
                        },
                        {
                            name: 'Зажигание',
                            key: 'ignition',
                            view( row ) {
                                return row.ignition ? 'Вкл' : 'Выкл';
                            }
                        },
                        {
                            name: 'Скорость',
                            key: 'speed'
                        },
                        {
                            name: 'Уровень топлива',
                            key: 'fuel_level',
                            view( row ) {
                                return row.fuel_level ? `${row.fuel_level}л` : '-';
                            }
                        },
                        {
                            name: 'Пробег',
                            key: 'mileage'
                        }
                    ]
                }
            );
        }

        _load_data() {
            this._storage.parse( CP.TestData );
        }

        destroy() {
            this._storage?.destroy();
            this._table?.destroy();
        }
    }

    CP.CarListModule = CarListModule;
})(window.CP);
