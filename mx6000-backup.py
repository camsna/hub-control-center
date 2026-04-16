#!/usr/bin/env python3
"""MX6000 Daily Backup - downloads config and saves as VMP-compatible .nprj"""

import urllib.request
import zipfile
import json
import io
import os
import glob
from datetime import datetime

BACKUP_DIR = "/backups"
MX6000_URL = "http://10.0.81.207:8001/api/v1/device/projectdoc/data"
KEEP_DAYS = 14

SCREEN_ID = "{7e8ded0a-a4d9-4003-9ecf-731d60d07280}"
DEVICE_KEY = "10.0.81.207@8001"
DEVICE_IP = "10.0.81.207"
DEVICE_SN = "00325901000006CC"
DEVICE_MAC = "54:b5:6c:1a:c9:ce"

def make_nprj(project_data, outpath):
    ts = datetime.now()
    ts_ms = int(ts.timestamp() * 1000)
    ts_s = int(ts.timestamp())

    check_xml = (
        '<ProjectConfig ProjectName="Auto Backup" ProjectVersion="1" '
        'VMPVersion="V1.5.0" GenerateTime="' + str(ts_ms) + '" '
        'ProjectId="onlineDefaultProjectUuidV1.5.0" IsOnlineProject="true">\n'
        '    <Devices DeviceNumber="1">\n'
        '        <Device slaveMac="" isBakcup="false" masterMac="">\n'
        '            <LastOperatorTime>' + str(ts_s) + '</LastOperatorTime>\n'
        '            <DeviceDataFilePath>' + DEVICE_IP + '_project_</DeviceDataFilePath>\n'
        '            <ProejctName>Auto Backup</ProejctName>\n'
        '            <ScreenGroups/>\n'
        '            <Screens>\n'
        '                <Screen name="Screen_0006CC"/>\n'
        '            </Screens>\n'
        '            <DeviceName>MX6000 Pro_0006CC</DeviceName>\n'
        '            <DeviceKey>' + DEVICE_KEY + '</DeviceKey>\n'
        '            <DeviceIp>' + DEVICE_IP + '</DeviceIp>\n'
        '            <DeviceSN>' + DEVICE_SN + '</DeviceSN>\n'
        '            <DeviceMAC>' + DEVICE_MAC + '</DeviceMAC>\n'
        '            <DeviceModelID>5377</DeviceModelID>\n'
        '            <DeviceTypeName>MX6000 Pro</DeviceTypeName>\n'
        '            <DeviceVersion>V1.5.0</DeviceVersion>\n'
        '            <Subcards>\n'
        '                <InputCard>\n'
        '                    <Id>0</Id><SlotId>0</SlotId><ModelId>41989</ModelId>\n'
        '                    <CardName>MX_2\u00d7HDMI2.1 input card</CardName>\n'
        '                    <CardTypeName>2\u00d7HDMI2.1</CardTypeName>\n'
        '                    <SubCardVersion>V1.5.0</SubCardVersion>\n'
        '                </InputCard>\n'
        '                <InputCard>\n'
        '                    <Id>1</Id><SlotId>1</SlotId><ModelId>41989</ModelId>\n'
        '                    <CardName>MX_2\u00d7HDMI2.1 input card</CardName>\n'
        '                    <CardTypeName>2\u00d7HDMI2.1</CardTypeName>\n'
        '                    <SubCardVersion>V1.5.0</SubCardVersion>\n'
        '                </InputCard>\n'
        '                <InputCard>\n'
        '                    <Id>2</Id><SlotId>2</SlotId><ModelId>41990</ModelId>\n'
        '                    <CardName>MX_4\u00d712G-SDI input card</CardName>\n'
        '                    <CardTypeName>4\u00d712G-SDI</CardTypeName>\n'
        '                    <SubCardVersion>V1.5.0</SubCardVersion>\n'
        '                </InputCard>\n'
        '                <OutputCard>\n'
        '                    <Id>8</Id><SlotId>0</SlotId><ModelId>42048</ModelId>\n'
        '                    <CardName>MX_4\u00d710G_Fiber output card</CardName>\n'
        '                    <CardTypeName>4\u00d710G Fiber</CardTypeName>\n'
        '                    <SubCardVersion>V1.5.0</SubCardVersion>\n'
        '                </OutputCard>\n'
        '            </Subcards>\n'
        '        </Device>\n'
        '    </Devices>\n'
        '</ProjectConfig>'
    )

    project_doc = json.dumps({
        "emailConfig": {"emailAlarmConfigList": {}, "temperatureType": 0, "languageType": 0},
        "projectData": {
            "projectID": "onlineDefaultProjectUuidV1.5.0",
            "screenProjectInfos": [{"screenID": SCREEN_ID, "screenProjectDeviceInfos": [{"DeviceKey": DEVICE_IP + ":8001"}]}],
            "deviceWorkMode": 0
        }
    }, separators=(',', ':'))

    xcenter_buf = io.BytesIO()
    with zipfile.ZipFile(xcenter_buf, 'w', zipfile.ZIP_DEFLATED) as xz:
        xz.writestr('projectDocData.json', project_doc)

    with zipfile.ZipFile(outpath, 'w', zipfile.ZIP_DEFLATED) as nprj:
        nprj.writestr(DEVICE_IP + '_project_', project_data)
        nprj.writestr('XCenterFile.zip', xcenter_buf.getvalue())
        nprj.writestr('check.xml', check_xml)


def make_backup():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    try:
        project_data = urllib.request.urlopen(MX6000_URL, timeout=30).read()
    except Exception as e:
        print("FAILED: Cannot reach MX6000: " + str(e))
        return False

    filename = datetime.now().strftime("MX6000 %Y-%m-%d %H%M.nprj")
    outpath = os.path.join(BACKUP_DIR, filename)
    make_nprj(project_data, outpath)
    size = os.path.getsize(outpath)
    print("OK: " + filename + " (" + str(size) + " bytes)")
    return True


def cleanup_old():
    pattern = os.path.join(BACKUP_DIR, "MX6000 *.nprj")
    backups = sorted(glob.glob(pattern))
    if len(backups) > KEEP_DAYS:
        to_delete = backups[:len(backups) - KEEP_DAYS]
        for f in to_delete:
            os.remove(f)
            print("Deleted old backup: " + os.path.basename(f))


if __name__ == "__main__":
    print("MX6000 Backup - " + datetime.now().isoformat())
    if make_backup():
        cleanup_old()
