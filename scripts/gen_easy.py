import json
import random

def generate_grid_for_type(ctype, target_val=None):
    """Generates a single 3x3 grid and correct_answers for a given type."""
    if ctype == 'match':
        target = target_val
        grid = [target]
        while len(grid) < 9:
            other = random.randint(1, 100)
            if other != target and other not in grid:
                grid.append(other)
        random.shuffle(grid)
        return grid, [grid.index(target)]
        
    elif ctype == 'property_ends':
        digit = target_val
        target = random.choice([n for n in range(10, 100) if n % 10 == digit])
        grid = [target]
        while len(grid) < 9:
            other = random.randint(1, 100)
            if other % 10 != digit and other not in grid:
                grid.append(other)
        random.shuffle(grid)
        return grid, [grid.index(target)]
        
    elif ctype == 'property_digits':
        is_single = target_val == 'single'
        if is_single:
            target = random.randint(1, 9)
            grid = [target]
            while len(grid) < 9:
                other = random.randint(10, 100)
                if other not in grid:
                    grid.append(other)
        else:
            target = random.randint(10, 99)
            grid = [target]
            while len(grid) < 9:
                other = random.randint(1, 9)
                if other not in grid:
                    grid.append(other)
        random.shuffle(grid)
        return grid, [grid.index(target)]

    elif ctype == 'highest' or ctype == 'lowest':
        is_highest = ctype == 'highest'
        nums = random.sample(range(1, 101), 9)
        target = max(nums) if is_highest else min(nums)
        return nums, [nums.index(target)]

    elif ctype == 'odd_one_out':
        is_even_target = target_val == 'even'
        if is_even_target:
            target = random.choice([n for n in range(2, 50, 2)])
            grid = [target]
            while len(grid) < 9:
                other = random.choice([n for n in range(1, 51, 2)])
                if other not in grid:
                    grid.append(other)
        else:
            target = random.choice([n for n in range(1, 51, 2)])
            grid = [target]
            while len(grid) < 9:
                other = random.choice([n for n in range(2, 52, 2)])
                if other not in grid:
                    grid.append(other)
        random.shuffle(grid)
        return grid, [grid.index(target)]

    return [], []

def generate_easy_challenges(count=50):
    challenges = []
    
    for i in range(count):
        type_roll = random.random()
        grids_data = []
        
        if type_roll < 0.2:
            # Match
            target_num = random.randint(1, 100)
            ctype = 'match'
            instruction = f"Find the number {target_num}"
            for _ in range(5):
                g, c = generate_grid_for_type('match', target_num)
                grids_data.append({"grid": g, "correct_answers": c})
            cid = f"easy_match_{i:02d}"
            
        elif type_roll < 0.4:
            # Property: Ends in X
            digit = random.choice([0, 5])
            ctype = 'property'
            instruction = f"Find the number ending in {digit}"
            for _ in range(5):
                g, c = generate_grid_for_type('property_ends', digit)
                grids_data.append({"grid": g, "correct_answers": c})
            cid = f"easy_prop_ends_{i:02d}"
            
        elif type_roll < 0.5:
            # Property: Single/Double digit
            use_single = random.random() < 0.5
            ctype = 'property'
            instruction = f"Find the {'single' if use_single else 'two'}-digit number"
            for _ in range(5):
                g, c = generate_grid_for_type('property_digits', 'single' if use_single else 'double')
                grids_data.append({"grid": g, "correct_answers": c})
            cid = f"easy_prop_digits_{i:02d}"

        elif type_roll < 0.7:
            # Highest / Lowest
            ctype = random.choice(['highest', 'lowest'])
            instruction = f"Find the {'highest' if ctype == 'highest' else 'lowest'} number"
            for _ in range(5):
                g, c = generate_grid_for_type(ctype)
                grids_data.append({"grid": g, "correct_answers": c})
            cid = f"easy_{ctype}_{i:02d}"
            
        elif type_roll < 0.85:
            # Varied wording
            real_type = random.choice(['highest', 'lowest'])
            adj = random.choice(['biggest', 'greatest']) if real_type == 'highest' else random.choice(['smallest', 'lowliest'])
            ctype = real_type
            instruction = f"Find the {adj} number"
            for _ in range(5):
                g, c = generate_grid_for_type(real_type)
                grids_data.append({"grid": g, "correct_answers": c})
            cid = f"easy_var_{real_type}_{i:02d}"

        else:
            # Odd one out
            target_parity = 'even' if random.random() < 0.5 else 'odd'
            ctype = 'odd_one_out'
            instruction = f"Find the only {target_parity} number"
            for _ in range(5):
                g, c = generate_grid_for_type('odd_one_out', target_parity)
                grids_data.append({"grid": g, "correct_answers": c})
            cid = f"easy_odd_{i:02d}"

        challenges.append({
            "id": cid,
            "type": ctype,
            "difficulty": "easy",
            "instruction": instruction,
            "grids": grids_data,
            "estimated_solve_time_ms": 1200,
            "difficulty_score": 1
        })
    
    return challenges

if __name__ == "__main__":
    new_easy = generate_easy_challenges(60)
    print(json.dumps(new_easy, indent=2))
