# Days 3–4: ESP32 + DHT22 Wiring & Hardware Guide

This guide provides step-by-step hardware wiring diagrams, pinout tables, and electrical considerations for connecting **1 to 2 ESP32 DevKit boards** to **DHT22 (AM2302)** temperature and humidity sensors.

---

## 1. Sensor Overview: DHT22 (AM2302)

The DHT22 is a digital sensor with a capacitive humidity sensor and a thermistor. It outputs a calibrated digital signal over a single custom one-wire bus.

| Parameter | DHT22 (AM2302) Specification |
|---|---|
| **Operating Voltage** | 3.3V – 5.5V DC (Use **3.3V** with ESP32) |
| **Current Consumption** | 1.0 – 1.5 mA (active), 40 – 50 μA (standby) |
| **Temperature Range** | -40°C to +80°C (±0.5°C accuracy, 0.1°C resolution) |
| **Humidity Range** | 0% to 100% RH (±2% accuracy, 0.1% resolution) |
| **Sampling Period** | Minimum 2 seconds between consecutive reads (Firmware uses **5 seconds**) |

---

## 2. Sensor Types & Wiring Configurations

There are two common physical form factors of the DHT22:

### Type A: 3-Pin DHT22 Breakout Module (Most Common)
Breakout modules come soldered to a small PCB with a built-in SMD pull-up resistor and decoupling capacitor.

```
       +-----------------------+
       |   DHT22 Sensor Grid   |
       +-----------------------+
       |   [PCB Module Board]  |
       +-----------------------+
          |         |        |
         VCC      DATA      GND
        ( + )     (out/S)   ( - )
          |         |        |
      ESP32 3.3V  GPIO 4  ESP32 GND
```

#### Pinout:
1. **`+` (VCC)**: Connect to **ESP32 3V3** (Pin 3.3V).
2. **`out` or `S` (DATA)**: Connect to **ESP32 GPIO 4** (or GPIO 22).
3. **`-` (GND)**: Connect to **ESP32 GND**.
> **Note**: No external resistor is required for this 3-pin module because the PCB already contains a 10kΩ pull-up resistor.

---

### Type B: 4-Pin Raw DHT22 / AM2302 Sensor (Bare Sensor)
If you have the white sensor without a breakout PCB, it has 4 pins.

```
   Front View (Facing the perforated grid):
        +-------------------+
        |  O O O O O O O O  |
        |  O O O O O O O O  |
        +-------------------+
             |   |   |   |
             1   2   3   4
            VDD DATA NC GND

   Wiring with 4.7kΩ–10kΩ Pull-Up Resistor:

             ESP32 3.3V
                 │
                 ├─── Pin 1 (VDD)
                 │
                ┌┴┐
                │ │ 4.7kΩ – 10kΩ Pull-Up Resistor
                └┬┘
                 │
                 ├─── Pin 2 (DATA) ─────────> ESP32 GPIO 4
                 │
             Pin 3 (NC) ── [Not Connected]
                 │
             Pin 4 (GND) ───────────────────> ESP32 GND
```

#### Pinout:
| Pin # | Pin Name | Description | Connection to ESP32 |
|---|---|---|---|
| **1** | **VDD / VCC** | Power Supply (3.3V - 5.5V) | Connect to **ESP32 3V3** |
| **2** | **DATA** | Digital 1-wire I/O | Connect to **ESP32 GPIO 4** + 10kΩ pull-up to 3V3 |
| **3** | **NC** | Not Connected | Leave floating (No connection) |
| **4** | **GND** | Ground | Connect to **ESP32 GND** |

---

## 3. ESP32 DevKit Pinout Reference (30-pin & 38-pin)

Recommended GPIOs for DHT22:
- **Primary recommendation**: `GPIO 4`
- **Secondary recommendation**: `GPIO 22` or `GPIO 21`

> [!WARNING]
> Avoid using strapping pins (`GPIO 0`, `GPIO 2`, `GPIO 12`, `GPIO 15`) or input-only pins (`GPIO 34`, `GPIO 35`, `GPIO 36`, `GPIO 39`) for DHT22 DATA. The DHT protocol requires bidirectional communication to send the start pulse and read pulses.

### ESP32 30-Pin DevKit V1 Diagram:
```
                     +-------------------+
               EN  --| 1              30 |-- D23
              VP*  --| 2              29 |-- D22 (Alt DHT Data)
              VN*  --| 3              28 |-- TX0
              D34* --| 4              27 |-- RX0
              D35* --| 5              26 |-- D21
              D32  --| 6              25 |-- D19
              D33  --| 7              24 |-- D18
              D25  --| 8              23 |-- D5
              D26  --| 9              22 |-- TX2
              D27  --| 10             21 |-- RX2
              D14  --| 11             20 |-- D4  <--- [DHT22 DATA PIN]
              D12  --| 12             19 |-- D2  (Onboard Status LED)
              D13  --| 13             18 |-- D15
              GND  --| 14             17 |-- GND <--- [DHT22 GND]
              VIN  --| 15             16 |-- 3V3 <--- [DHT22 VCC]
                     +-------------------+
                     * = Input-only pins
```

---

## 4. Multi-Device Wiring (1–2 ESP32 Boards)

When deploying two boards in your environment:

### Node 1: `esp32-dht22-01`
- **Device ID**: `esp32-dht22-01`
- **MQTT Topic**: `devices/esp32-dht22-01/telemetry`
- **VCC**: ESP32 Node 1 `3V3`
- **DATA**: ESP32 Node 1 `GPIO 4`
- **GND**: ESP32 Node 1 `GND`

### Node 2: `esp32-dht22-02`
- **Device ID**: `esp32-dht22-02`
- **MQTT Topic**: `devices/esp32-dht22-02/telemetry`
- **VCC**: ESP32 Node 2 `3V3`
- **DATA**: ESP32 Node 2 `GPIO 4`
- **GND**: ESP32 Node 2 `GND`

---

## 5. Breadboard Assembly Checklist

1. **Verify Voltage**: Always connect DHT22 VCC to **3.3V (`3V3`)** rather than `VIN` (5V). While DHT22 supports 5V, its data pin outputs signals at the supply voltage. Connecting 5V VCC would feed 5V into the ESP32 GPIO, which exceeds the ESP32 3.3V logic tolerance.
2. **Check Resistor**: If using a 4-pin raw sensor, ensure a 4.7kΩ to 10kΩ resistor bridges VCC and DATA.
3. **USB Cable**: Ensure you are using a **data-capable micro-USB / USB-C cable**, not a charge-only cable.
4. **Driver Installation**:
   - If using CP2102-based DevKits: Install Silicon Labs CP210x VCP Drivers.
   - If using CH340-based DevKits: Install WCH CH340/CH341 USB-to-Serial Drivers.

---

## 6. Hardware Troubleshooting

| Symptom | Probable Cause | Remedy |
|---|---|---|
| `Failed to read from sensor!` in Serial monitor | Loose DATA wire or missing pull-up | Check GPIO 4 connection; verify 10kΩ pull-up resistor between VCC and DATA |
| Readings report `nan` intermittently | Reading too frequently | DHT22 requires ≥ 2 seconds between reads. Firmware uses 5 seconds, so ensure no duplicate reads occur in quick succession |
| Sensor body feels hot | Reversed polarity (VCC and GND swapped) | Immediately disconnect USB power; verify VCC and GND connections |
| ESP32 reboots continuously on startup | Power sag when WiFi/RF activates | Use a USB port with adequate current (≥ 500mA) or external powered USB hub |
| ESP32 COM port not appearing in Windows | Charge-only cable or missing driver | Swap USB cable for a certified data cable; check Windows Device Manager under `Ports (COM & LPT)` |
