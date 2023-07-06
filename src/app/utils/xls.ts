export interface IExcel {
    name: string;
    data: object[];
}

export const ExcelXML = (() => {
    let workbook = '';
    let workbookStart =
        '<?xml version="1.0"?><ss:Workbook  xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" xmlns:html="http://www.w3.org/TR/REC-html40">';
    const workbookEnd = '</ss:Workbook>';
    let worksheet = '';
    let columnWidth = 0;
    let uri = '';

    class ExcelXML {
        constructor(data: IExcel[]) {
            data.forEach((d) => {
                let finalDataArray: any[] = [];

                d.data.forEach((item) => {
                    finalDataArray.push(flatten(item));
                });

                let s = JSON.stringify(finalDataArray);

                worksheet += myXMLWorkSheet(d.name, s.replace(/&/gi, '&amp;'));
            });
        }

        downLoad(fileName: string, columnWidth?: number) {
            columnWidth = columnWidth;
            workbookStart += myXMLStyles(1);

            workbook = workbookStart + worksheet + workbookEnd;

            uri = 'data:text/xls;charset=utf-8,' + encodeURIComponent(workbook);

            const link = document.createElement('a');
            link.href = uri;
            link.download = fileName + '.xls';
            link.click();
        }
    }

    const myXMLStyles = function (id: number) {
        let Styles = '<ss:Styles><ss:Style ss:ID="' + id + '"><ss:Font ss:Bold="1"/></ss:Style></ss:Styles>';

        return Styles;
    };

    const myXMLWorkSheet = function (name: string, o: string) {
        const Table = myXMLTable(o);
        let WorksheetStart = '<ss:Worksheet ss:Name="' + name + '">';
        const WorksheetEnd = '</ss:Worksheet>';

        return WorksheetStart + Table + WorksheetEnd;
    };

    const myXMLTable = function (o: string) {
        let TableStart = '<ss:Table>';
        const TableEnd = '</ss:Table>';

        const tableData = JSON.parse(o);

        if (tableData.length > 0) {
            const columnHeader = Object.keys(tableData[0]);
            let rowData: string = '';
            for (let i = 0; i < columnHeader.length; i++) {
                TableStart += myXMLColumn(columnWidth);
            }
            for (let j = 0; j < tableData.length; j++) {
                rowData += myXMLRow(tableData[j], columnHeader);
            }
            TableStart += myXMLHead(1, columnHeader);
            TableStart += rowData;
        }

        return TableStart + TableEnd;
    };

    const myXMLColumn = function (w: number) {
        return '<ss:Column ss:AutoFitWidth="' + (w ? 0 : 1) + '" ss:Width="' + w + '"/>';
    };

    const myXMLHead = function (id: number, h: string[]) {
        let HeadStart = '<ss:Row ss:StyleID="' + id + '">';
        const HeadEnd = '</ss:Row>';

        for (let i = 0; i < h.length; i++) {
            const Cell = myXMLCell(h[i].toUpperCase());
            HeadStart += Cell;
        }

        return HeadStart + HeadEnd;
    };

    const myXMLRow = function (r: any, h: string[]) {
        let RowStart = '<ss:Row>';
        const RowEnd = '</ss:Row>';
        for (let i = 0; i < h.length; i++) {
            const Cell = myXMLCell(r[h[i]]);
            RowStart += Cell;
        }

        return RowStart + RowEnd;
    };

    const myXMLCell = function (n: string) {
        let CellStart = '<ss:Cell>';
        const CellEnd = '</ss:Cell>';

        const Data = myXMLData(n);
        CellStart += Data;

        return CellStart + CellEnd;
    };

    const myXMLData = function (d: string) {
        let DataStart = '<ss:Data ss:Type="String">';
        const DataEnd = '</ss:Data>';

        return DataStart + d + DataEnd;
    };

    const flatten: any = function (obj: any) {
        var obj1 = JSON.parse(JSON.stringify(obj));
        const obj2 = JSON.parse(JSON.stringify(obj));
        if (typeof obj === 'object') {
            for (var k1 in obj2) {
                if (obj2.hasOwnProperty(k1)) {
                    if (typeof obj2[k1] === 'object' && obj2[k1] !== null) {
                        delete obj1[k1];
                        for (var k2 in obj2[k1]) {
                            if (obj2[k1].hasOwnProperty(k2)) {
                                obj1[k1 + '-' + k2] = obj2[k1][k2];
                            }
                        }
                    }
                }
            }
            var hasObject = false;
            for (var key in obj1) {
                if (obj1.hasOwnProperty(key)) {
                    if (typeof obj1[key] === 'object' && obj1[key] !== null) {
                        hasObject = true;
                    }
                }
            }
            if (hasObject) {
                return flatten(obj1);
            } else {
                return obj1;
            }
        } else {
            return obj1;
        }
    };

    return ExcelXML;
})();
