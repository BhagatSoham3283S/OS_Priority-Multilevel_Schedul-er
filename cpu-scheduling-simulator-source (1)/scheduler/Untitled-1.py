
import tkinter as tk
from tkinter import ttk, messagebox

# Store all process information
processes = []


# Add a process to the table
def add_process():
    try:
        pid = id_entry.get().strip()
        arrival = int(arrival_entry.get())
        burst = int(burst_entry.get())
        priority = int(priority_entry.get())
        queue = queue_box.get()

        if not pid:
            raise ValueError("Enter a Process ID.")

        if any(p["id"] == pid for p in processes):
            raise ValueError("Process ID must be unique.")

        if arrival < 0 or burst <= 0:
            raise ValueError(
                "Arrival time must be >= 0 and burst time > 0."
            )

        if priority < 1:
            raise ValueError("Priority must be at least 1.")

        if not queue:
            raise ValueError("Select a queue type.")

        process = {
            "id": pid,
            "arrival": arrival,
            "burst": burst,
            "priority": priority,
            "queue": queue
        }

        processes.append(process)

        process_table.insert(
            "", "end",
            values=(pid, arrival, burst, priority, queue)
        )

        id_entry.delete(0, tk.END)
        arrival_entry.delete(0, tk.END)
        burst_entry.delete(0, tk.END)
        priority_entry.delete(0, tk.END)

    except ValueError as error:
        messagebox.showerror("Invalid Input", str(error))


# Clear all process data
def clear_all():
    processes.clear()

    for item in process_table.get_children():
        process_table.delete(item)

    for item in result_table.get_children():
        result_table.delete(item)

    result_label.config(text="Enter processes and run a simulation.")


# Run the selected algorithm
def run_priority():
    # Make a copy so the original input data remains unchanged
    pending = [p.copy() for p in processes]
    current_time = 0
    results = []
    gantt = []

    # Non-preemptive Priority Scheduling
    while pending:
        # Find processes that have already arrived
        available = [
            p for p in pending
            if p["arrival"] <= current_time
        ]

        # If no process has arrived, advance the clock
        if not available:
            current_time = min(p["arrival"] for p in pending)
            available = [
                p for p in pending
                if p["arrival"] <= current_time
            ]

        # Smaller priority number means higher priority
        selected = min(
            available,
            key=lambda p: (p["priority"], p["arrival"])
        )

        start_time = current_time
        current_time += selected["burst"]
        completion = current_time

        turnaround = completion - selected["arrival"]
        waiting = turnaround - selected["burst"]

        results.append({
            "id": selected["id"],
            "arrival": selected["arrival"],
            "burst": selected["burst"],
            "priority": selected["priority"],
            "completion": completion,
            "turnaround": turnaround,
            "waiting": waiting
        })

        gantt.append(
            f'{selected["id"]} ({start_time}-{completion})'
        )

        pending.remove(selected)

    # Display individual process results
    for p in results:
        result_table.insert(
            "",
            "end",
            values=(
                p["id"],
                p["completion"],
                p["turnaround"],
                p["waiting"]
            )
        )

    # Calculate performance parameters
    total_waiting = sum(p["waiting"] for p in results)
    total_turnaround = sum(p["turnaround"] for p in results)
    total_burst = sum(p["burst"] for p in results)
    number_of_processes = len(results)

    first_arrival = min(p["arrival"] for p in results)
    elapsed_time = current_time - first_arrival

    avg_waiting = total_waiting / number_of_processes
    avg_turnaround = total_turnaround / number_of_processes

    if elapsed_time > 0:
        cpu_utilization = (total_burst / elapsed_time) * 100
        throughput = number_of_processes / elapsed_time
    else:
        cpu_utilization = 0
        throughput = 0

    result_label.config(
        text=(
            f"Algorithm: Priority Scheduling\n"
            f"Execution Order: {' -> '.join(gantt)}\n"
            f"Average Waiting Time: {avg_waiting:.2f}\n"
            f"Average Turnaround Time: {avg_turnaround:.2f}\n"
            f"CPU Utilization: {cpu_utilization:.2f}%\n"
            f"Throughput: {throughput:.3f} processes/unit time"
        ),
        justify="left"
    )

def run_mlq():
    TIME_QUANTUM = 2

    pending = [p.copy() for p in processes]
    remaining = {p["id"]: p["burst"] for p in pending}
    completion_times = {}
    gantt = []
    current_time = 0

    # Separate processes into queues
    system_queue = sorted(
        [p for p in pending if p["queue"] == "System"],
        key=lambda p: (p["arrival"], p["priority"])
    )

    interactive_queue = sorted(
        [p for p in pending if p["queue"] == "Interactive"],
        key=lambda p: p["arrival"]
    )

    batch_queue = sorted(
        [p for p in pending if p["queue"] == "Batch"],
        key=lambda p: p["arrival"]
    )

    interactive_ready = []
    completed = set()

    while len(completed) < len(pending):

        # Add arrived interactive processes to the ready queue
        for p in interactive_queue:
            if (
                p["arrival"] <= current_time
                and p["id"] not in completed
                and p not in interactive_ready
            ):
                interactive_ready.append(p)

        # Select an arrived System process first
        available_system = [
            p for p in system_queue
            if p["arrival"] <= current_time
            and p["id"] not in completed
        ]

        if available_system:
            selected = min(
                available_system,
                key=lambda p: (p["priority"], p["arrival"])
            )

            start = current_time
            current_time += remaining[selected["id"]]
            remaining[selected["id"]] = 0
            completion_times[selected["id"]] = current_time
            completed.add(selected["id"])

            gantt.append(
                f'{selected["id"]} ({start}-{current_time})'
            )
            continue

        # Interactive queue uses Round Robin
        if interactive_ready:
            selected = interactive_ready.pop(0)
            pid = selected["id"]

            start = current_time
            run_time = min(TIME_QUANTUM, remaining[pid])
            current_time += run_time
            remaining[pid] -= run_time

            gantt.append(
                f'{pid} ({start}-{current_time})'
            )

            if remaining[pid] == 0:
                completion_times[pid] = current_time
                completed.add(pid)
            else:
                # Re-add unfinished process to the end
                interactive_ready.append(selected)

            continue

        # Batch queue uses FCFS
        available_batch = [
            p for p in batch_queue
            if p["arrival"] <= current_time
            and p["id"] not in completed
        ]

        if available_batch:
            selected = min(
                available_batch,
                key=lambda p: p["arrival"]
            )

            start = current_time
            current_time += remaining[selected["id"]]
            remaining[selected["id"]] = 0
            completion_times[selected["id"]] = current_time
            completed.add(selected["id"])

            gantt.append(
                f'{selected["id"]} ({start}-{current_time})'
            )
            continue

        # No process is ready: move to the next arrival time
        unfinished = [
            p for p in pending
            if p["id"] not in completed
        ]

        next_arrival = min(p["arrival"] for p in unfinished)

        if next_arrival > current_time:
            gantt.append(f"IDLE ({current_time}-{next_arrival})")

        current_time = next_arrival

    # Calculate individual results
    results = []

    for p in processes:
        completion = completion_times[p["id"]]
        turnaround = completion - p["arrival"]
        waiting = turnaround - p["burst"]

        results.append({
            "id": p["id"],
            "arrival": p["arrival"],
            "burst": p["burst"],
            "completion": completion,
            "turnaround": turnaround,
            "waiting": waiting
        })

    # Display process results
    for p in results:
        result_table.insert(
            "",
            "end",
            values=(
                p["id"],
                p["completion"],
                p["turnaround"],
                p["waiting"]
            )
        )

    # Calculate performance parameters
    n = len(results)
    total_burst = sum(p["burst"] for p in results)
    total_waiting = sum(p["waiting"] for p in results)
    total_turnaround = sum(p["turnaround"] for p in results)

    first_arrival = min(p["arrival"] for p in results)
    elapsed_time = current_time - first_arrival

    avg_waiting = total_waiting / n
    avg_turnaround = total_turnaround / n

    if elapsed_time > 0:
        cpu_utilization = total_burst / elapsed_time * 100
        throughput = n / elapsed_time
    else:
        cpu_utilization = 0
        throughput = 0

    result_label.config(
        text=(
            "Algorithm: Multilevel Queue Scheduling\n"
            "Queue Order: System → Interactive → Batch\n"
            "Interactive Time Quantum: 2\n"
            f"Execution Order: {' → '.join(gantt)}\n"
            f"Average Waiting Time: {avg_waiting:.2f}\n"
            f"Average Turnaround Time: {avg_turnaround:.2f}\n"
            f"CPU Utilization: {cpu_utilization:.2f}%\n"
            f"Throughput: {throughput:.3f} processes/unit time"
        ),
        justify="left"
    )

def run_simulation():
    if not processes:
        messagebox.showwarning(
            "No Processes",
            "Please add at least one process."
        )
        return

    for item in result_table.get_children():
        result_table.delete(item)

    if algorithm_box.get() == "Priority Scheduling":
        run_priority()
    elif algorithm_box.get() == "Multilevel Queue":
        run_mlq()


# Main application window
root = tk.Tk()
root.title("CPU Scheduling Simulator")
root.geometry("1200x850")
root.minsize(1000, 760)
root.configure(bg="#F2F5F7")

# Slightly increase font sizes
style = ttk.Style(root)
style.configure(".", font=("Arial", 11))
style.configure("Treeview", font=("Arial", 11), rowheight=27)
style.configure(
    "Treeview.Heading",
    font=("Arial", 11, "bold")
)
style.configure("TLabelframe.Label", font=("Arial", 11, "bold"))

# Application heading
title = tk.Label(
    root,
    text="CPU SCHEDULING SIMULATOR",
    font=("Arial", 24, "bold"),
    bg="#183B56",
    fg="white",
    pady=18
)
title.pack(fill="x")

# Process input section
input_frame = ttk.LabelFrame(
    root, text="Process Details", padding=12
)
input_frame.pack(fill="x", padx=20, pady=10)

ttk.Label(input_frame, text="Process ID").grid(
    row=0, column=0, padx=8, pady=5
)
ttk.Label(input_frame, text="Arrival Time").grid(
    row=0, column=1, padx=8, pady=5
)
ttk.Label(input_frame, text="Burst Time").grid(
    row=0, column=2, padx=8, pady=5
)
ttk.Label(input_frame, text="Priority").grid(
    row=0, column=3, padx=8, pady=5
)
ttk.Label(input_frame, text="Queue Type").grid(
    row=0, column=4, padx=8, pady=5
)

id_entry = ttk.Entry(input_frame, width=15)
id_entry.grid(row=1, column=0, padx=8, pady=5)

arrival_entry = ttk.Entry(input_frame, width=15)
arrival_entry.grid(row=1, column=1, padx=8, pady=5)

burst_entry = ttk.Entry(input_frame, width=15)
burst_entry.grid(row=1, column=2, padx=8, pady=5)

priority_entry = ttk.Entry(input_frame, width=15)
priority_entry.grid(row=1, column=3, padx=8, pady=5)

queue_box = ttk.Combobox(
    input_frame,
    values=["System", "Interactive", "Batch"],
    state="readonly",
    width=13
)
queue_box.grid(row=1, column=4, padx=8, pady=5)
queue_box.set("System")

ttk.Button(
    input_frame,
    text="Add Process",
    command=add_process
).grid(row=1, column=5, padx=10, pady=5)

# Process table
process_frame = ttk.LabelFrame(
    root, text="Process Table", padding=10
)
process_frame.pack(fill="x", padx=20, pady=10)

columns = ("ID", "Arrival", "Burst", "Priority", "Queue")

process_table = ttk.Treeview(
    process_frame,
    columns=columns,
    show="headings",
    height=6
)

for column in columns:
    process_table.heading(column, text=column)
    process_table.column(
        column, anchor="center", width=150
    )

process_table.pack(fill="x")

# Simulation controls
control_frame = ttk.LabelFrame(
    root, text="Simulation Controls", padding=12
)
control_frame.pack(fill="x", padx=20, pady=10)

ttk.Label(
    control_frame, text="Select Algorithm:"
).pack(side="left", padx=8)

algorithm_box = ttk.Combobox(
    control_frame,
    values=["Priority Scheduling", "Multilevel Queue"],
    state="readonly",
    width=25
)
algorithm_box.set("Priority Scheduling")
algorithm_box.pack(side="left", padx=8)

ttk.Button(
    control_frame,
    text="Run Simulation",
    command=run_simulation
).pack(side="left", padx=8)

ttk.Button(
    control_frame,
    text="Clear All",
    command=clear_all
).pack(side="left", padx=8)

# Simulation results table
result_frame = ttk.LabelFrame(
    root, text="Simulation Results", padding=10
)
result_frame.pack(fill="x", padx=20, pady=10)

result_columns = (
    "ID",
    "Completion Time",
    "Turnaround Time",
    "Waiting Time"
)

result_table = ttk.Treeview(
    result_frame,
    columns=result_columns,
    show="headings",
    height=8
)

for column in result_columns:
    result_table.heading(column, text=column)
    result_table.column(
        column, anchor="center", width=200
    )

result_table.pack(fill="x")

# Execution order and performance summary
summary_frame = ttk.LabelFrame(
    root, text="Performance Summary", padding=12
)
summary_frame.pack(
    fill="both", expand=True, padx=20, pady=(0, 15)
)

result_label = ttk.Label(
    summary_frame,
    text="Enter processes and run a simulation.",
    font=("Arial", 11),
    justify="left",
    anchor="w",
    wraplength=1100
)
result_label.pack(fill="both", expand=True)

# Start the application
root.mainloop()
